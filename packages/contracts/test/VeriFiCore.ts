import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import {
  encodeAbiParameters,
  keccak256,
  parseEther,
  stringToHex,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { evidenceFixture } from "../../../apps/api/src/evidenceFixtures.js";
import { scenarioRecord, signPaymentRecord } from "../../../apps/api/src/paymentOracle.js";
import { verifyClaimFromEnvelope } from "../../../apps/agent/src/verify.js";
import { hashCanonical } from "@veritable/policy";

const { viem } = await network.create();
const publicClient = await viem.getPublicClient();
const testClient = await viem.getTestClient();

const ASSET_ID = keccak256(stringToHex("asset:lagos-demo-property"));
const PERIOD_AUG = keccak256(stringToHex("2026-08"));
const EVIDENCE_EXACT = keccak256(stringToHex("evidence:exact-payment"));
const EVIDENCE_FALSE = keccak256(stringToHex("evidence:false-positive"));
const POLICY_HASH = keccak256(stringToHex("policy-v1"));
const REPORT_HASH = keccak256(stringToHex("report-v1"));
const MODEL_RUN_HASH = keccak256(stringToHex("model-run-v1"));
const DEMO_PAYER_REFERENCE = `0x${"33".repeat(32)}`;
const TERMS_HASH = hashCanonical({
  expectedAmountMinor: "2000000000",
  dueDate: "2026-08-01",
  windowDays: 5,
  amountToleranceMinor: "0",
  payerReferenceHash: DEMO_PAYER_REFERENCE,
}) as Hex;
const USDT = 10n ** 6n;
const CLAIM_AMOUNT = 2_000n * USDT;
const VERIFIER_BOND = parseEther("10");
const CHALLENGER_BOND = parseEther("1");
const CHALLENGE_WINDOW = 3_600n;
const EVIDENCE_SIGNER_KEY = `0x${"01".padStart(64, "0")}` as const;

async function deployedFixture(evidenceRoot: Hex = EVIDENCE_EXACT) {
  const [admin, issuer, holderA, holderB, verifier, challenger, treasury] =
    await viem.getWalletClients();

  assert.ok(admin?.account && issuer?.account && holderA?.account && holderB?.account);
  assert.ok(verifier?.account && challenger?.account && treasury?.account);

  const mockUsdt = await viem.deployContract("MockUSDT", [], {
    client: { wallet: admin },
  });
  const assetRegistry = await viem.deployContract("AssetRegistry", [admin.account.address], {
    client: { wallet: admin },
  });
  const shareToken = await viem.deployContract(
    "RevenueShareToken",
    ["Lagos Demo Property", "VDP", admin.account.address],
    { client: { wallet: admin } },
  );
  const staking = await viem.deployContract(
    "VerifierStaking",
    [admin.account.address, 3_600n],
    { client: { wallet: admin } },
  );
  const vault = await viem.deployContract(
    "YieldVault",
    [admin.account.address, mockUsdt.address, assetRegistry.address, 3_600n],
    { client: { wallet: admin } },
  );
  const registry = await viem.deployContract(
    "AttestationRegistry",
    [
      admin.account.address,
      vault.address,
      assetRegistry.address,
      staking.address,
      treasury.account.address,
      VERIFIER_BOND,
      CHALLENGER_BOND,
      CHALLENGE_WINDOW,
    ],
    { client: { wallet: admin } },
  );

  const snapshotRole = await shareToken.read.SNAPSHOT_ROLE();
  const vaultRegistryRole = await vault.read.ATTESTATION_REGISTRY_ROLE();
  const stakingRegistryRole = await staking.read.REGISTRY_ROLE();
  const verifierRole = await registry.read.VERIFIER_ROLE();

  await shareToken.write.grantRole([snapshotRole, vault.address]);
  await vault.write.grantRole([vaultRegistryRole, registry.address]);
  await staking.write.grantRole([stakingRegistryRole, registry.address]);
  await registry.write.grantRole([verifierRole, verifier.account.address]);

  await assetRegistry.write.registerAsset([
    ASSET_ID,
    issuer.account.address,
    shareToken.address,
    POLICY_HASH,
    TERMS_HASH,
  ]);
  await shareToken.write.mint([holderA.account.address, 60n]);
  await shareToken.write.mint([holderB.account.address, 40n]);
  await mockUsdt.write.mint([issuer.account.address, CLAIM_AMOUNT]);

  const issuerUsdt = await viem.getContractAt("MockUSDT", mockUsdt.address, {
    client: { wallet: issuer },
  });
  const issuerVault = await viem.getContractAt("YieldVault", vault.address, {
    client: { wallet: issuer },
  });
  const verifierStaking = await viem.getContractAt("VerifierStaking", staking.address, {
    client: { wallet: verifier },
  });

  await issuerUsdt.write.approve([vault.address, CLAIM_AMOUNT]);
  await verifierStaking.write.stake([], { value: parseEther("100") });
  await issuerVault.write.submitClaim([ASSET_ID, PERIOD_AUG, CLAIM_AMOUNT, evidenceRoot]);

  const chainId = await publicClient.getChainId();
  const claimId = keccak256(
    encodeAbiParameters(
      [
        { type: "uint256" },
        { type: "address" },
        { type: "bytes32" },
        { type: "bytes32" },
      ],
      [BigInt(chainId), vault.address, ASSET_ID, PERIOD_AUG],
    ),
  );

  return {
    accounts: { admin, issuer, holderA, holderB, verifier, challenger, treasury },
    contracts: { mockUsdt, assetRegistry, shareToken, staking, vault, registry },
    claimId,
    evidenceRoot,
  };
}

async function submitAttestation(
  fixture: Awaited<ReturnType<typeof deployedFixture>>,
  outcome: 1 | 2,
  verifiedAmount: bigint,
  reportHash: Hex = REPORT_HASH,
  termsHash: Hex = TERMS_HASH,
) {
  const { verifier } = fixture.accounts;
  assert.ok(verifier.account);
  const latestBlock = await publicClient.getBlock();
  const deadline = latestBlock.timestamp + 86_400n;
  const data = {
    claimId: fixture.claimId,
    assetId: ASSET_ID,
    periodKey: PERIOD_AUG,
    claimedAmount: CLAIM_AMOUNT,
    verifiedAmount,
    outcome,
    evidenceRoot: fixture.evidenceRoot,
    reportHash,
    policyHash: POLICY_HASH,
    termsHash,
    modelRunHash: MODEL_RUN_HASH,
    nonce: 0n,
    deadline,
  } as const;

  const chainId = await publicClient.getChainId();
  const signature = await verifier.signTypedData({
    account: verifier.account,
    domain: {
      name: "VeriFi Attestation Registry",
      version: "1",
      chainId,
      verifyingContract: fixture.contracts.registry.address,
    },
    types: {
      Attestation: [
        { name: "claimId", type: "bytes32" },
        { name: "assetId", type: "bytes32" },
        { name: "periodKey", type: "bytes32" },
        { name: "claimedAmount", type: "uint256" },
        { name: "verifiedAmount", type: "uint256" },
        { name: "outcome", type: "uint8" },
        { name: "evidenceRoot", type: "bytes32" },
        { name: "reportHash", type: "bytes32" },
        { name: "policyHash", type: "bytes32" },
        { name: "termsHash", type: "bytes32" },
        { name: "modelRunHash", type: "bytes32" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "Attestation",
    message: data,
  });

  const attestationId = await fixture.contracts.registry.read.hashAttestation([data]);
  await fixture.contracts.registry.write.submitAttestation([data, signature]);
  return { attestationId, data };
}

async function passChallengeWindow() {
  await testClient.increaseTime({ seconds: Number(CHALLENGE_WINDOW + 1n) });
  await testClient.mine({ blocks: 1 });
}

describe("Veritable core protocol", () => {
  it("lets an issuer create a registered asset with bounded initial allocations", async () => {
    const fixture = await deployedFixture();
    const factory = await viem.deployContract(
      "AssetFactory",
      [fixture.contracts.assetRegistry.address, fixture.contracts.vault.address],
    );
    await fixture.contracts.assetRegistry.write.grantRole([
      await fixture.contracts.assetRegistry.read.ASSET_MANAGER_ROLE(),
      factory.address,
    ]);
    const issuerFactory = await viem.getContractAt("AssetFactory", factory.address, {
      client: { wallet: fixture.accounts.issuer },
    });
    const newAssetId = keccak256(stringToHex("asset:issuer-created-solar"));
    await issuerFactory.write.createAsset([
      newAssetId,
      "Issuer Solar Two",
      "vSOLAR2",
      POLICY_HASH,
      TERMS_HASH,
      [fixture.accounts.holderA.account!.address, fixture.accounts.holderB.account!.address],
      [60n * 10n ** 18n, 40n * 10n ** 18n],
    ]);
    assert.equal(
      String(await fixture.contracts.assetRegistry.read.issuerOf([newAssetId])).toLowerCase(),
      fixture.accounts.issuer.account!.address.toLowerCase(),
    );
    const tokenAddress = await fixture.contracts.assetRegistry.read.shareTokenOf([newAssetId]) as Address;
    const token = await viem.getContractAt("RevenueShareToken", tokenAddress);
    assert.equal(await token.read.balanceOf([fixture.accounts.holderA.account!.address]), 60n * 10n ** 18n);
    assert.equal(await token.read.hasRole([await token.read.SNAPSHOT_ROLE(), fixture.contracts.vault.address]), true);
    assert.equal(await token.read.hasRole([await token.read.DEFAULT_ADMIN_ROLE(), factory.address]), false);
  });

  it("runs signed evidence through deterministic policy into on-chain settlement", async () => {
    const fixture = await deployedFixture();
    const now = new Date("2026-08-03T00:00:00.000Z");
    const sourceAccount = privateKeyToAccount(EVIDENCE_SIGNER_KEY);
    const evidence = evidenceFixture(
      "rent-paid-exact",
      fixture.claimId,
      ASSET_ID,
      CLAIM_AMOUNT.toString(),
    );
    const signedPayment = await signPaymentRecord(
      scenarioRecord("rent-paid-exact", now),
      EVIDENCE_SIGNER_KEY,
    );
    const verified = await verifyClaimFromEnvelope(
      evidence,
      signedPayment,
      now,
      sourceAccount.address,
    );
    assert.equal(verified.report.outcome, "VERIFIED");
    assert.equal(verified.report.verifiedAmountMinor, CLAIM_AMOUNT.toString());

    const { attestationId } = await submitAttestation(
      fixture,
      1,
      BigInt(verified.report.verifiedAmountMinor),
      verified.reportHash as Hex,
    );
    await passChallengeWindow();
    await fixture.contracts.registry.write.settle([attestationId]);
    const holderVault = await viem.getContractAt("YieldVault", fixture.contracts.vault.address, {
      client: { wallet: fixture.accounts.holderA },
    });
    await holderVault.write.claimYield([fixture.claimId]);
    assert.equal(
      await fixture.contracts.mockUsdt.read.balanceOf([fixture.accounts.holderA.account!.address]),
      1_200n * USDT,
    );
  });

  it("releases verified yield using immutable snapshot entitlements", async () => {
    const fixture = await deployedFixture();
    const { attestationId } = await submitAttestation(fixture, 1, CLAIM_AMOUNT);

    const holderAToken = await viem.getContractAt(
      "RevenueShareToken",
      fixture.contracts.shareToken.address,
      { client: { wallet: fixture.accounts.holderA } },
    );
    await holderAToken.write.transfer([fixture.accounts.holderB.account!.address, 60n]);

    await passChallengeWindow();
    await fixture.contracts.registry.write.settle([attestationId]);

    const holderAVault = await viem.getContractAt("YieldVault", fixture.contracts.vault.address, {
      client: { wallet: fixture.accounts.holderA },
    });
    const holderBVault = await viem.getContractAt("YieldVault", fixture.contracts.vault.address, {
      client: { wallet: fixture.accounts.holderB },
    });
    await holderAVault.write.claimYield([fixture.claimId]);
    await holderBVault.write.claimYield([fixture.claimId]);

    assert.equal(
      await fixture.contracts.mockUsdt.read.balanceOf([fixture.accounts.holderA.account!.address]),
      1_200n * USDT,
    );
    assert.equal(
      await fixture.contracts.mockUsdt.read.balanceOf([fixture.accounts.holderB.account!.address]),
      800n * USDT,
    );
    assert.equal(await fixture.contracts.staking.read.freeStake([fixture.accounts.verifier.account!.address]), parseEther("100"));
  });

  it("blocks a negative attestation and releases no holder funds", async () => {
    const fixture = await deployedFixture();
    const { attestationId } = await submitAttestation(fixture, 2, 0n);
    await passChallengeWindow();
    await fixture.contracts.registry.write.settle([attestationId]);

    const claim = (await fixture.contracts.vault.read.getClaim([fixture.claimId])) as {
      status: number;
    };
    assert.equal(claim.status, 3);
    const holderAVault = await viem.getContractAt("YieldVault", fixture.contracts.vault.address, {
      client: { wallet: fixture.accounts.holderA },
    });
    await assert.rejects(holderAVault.write.claimYield([fixture.claimId]));
    assert.equal(
      await fixture.contracts.mockUsdt.read.balanceOf([fixture.accounts.holderA.account!.address]),
      0n,
    );
  });

  it("slashes a false verifier approval after a successful challenge", async () => {
    const fixture = await deployedFixture(EVIDENCE_FALSE);
    const { attestationId } = await submitAttestation(fixture, 1, CLAIM_AMOUNT);
    const challengerRegistry = await viem.getContractAt(
      "AttestationRegistry",
      fixture.contracts.registry.address,
      { client: { wallet: fixture.accounts.challenger } },
    );
    await challengerRegistry.write.challenge(
      [attestationId, keccak256(stringToHex("counter-evidence:underpaid"))],
      { value: CHALLENGER_BOND },
    );
    await fixture.contracts.registry.write.resolve([attestationId, false, 2, 0n]);

    assert.equal(
      await fixture.contracts.staking.read.freeStake([fixture.accounts.verifier.account!.address]),
      parseEther("90"),
    );
    assert.equal(
      await fixture.contracts.staking.read.lockedStake([fixture.accounts.verifier.account!.address]),
      0n,
    );
    const claim = (await fixture.contracts.vault.read.getClaim([fixture.claimId])) as {
      status: number;
    };
    assert.equal(claim.status, 3);
  });

  it("prevents verifier stake withdrawal while the bond is locked", async () => {
    const fixture = await deployedFixture();
    await submitAttestation(fixture, 1, CLAIM_AMOUNT);
    const verifierStaking = await viem.getContractAt(
      "VerifierStaking",
      fixture.contracts.staking.address,
      { client: { wallet: fixture.accounts.verifier } },
    );
    await assert.rejects(verifierStaking.write.requestUnstake([parseEther("100")]));
  });

  it("rejects a replayed attestation for the same claim", async () => {
    const fixture = await deployedFixture();
    const first = await submitAttestation(fixture, 1, CLAIM_AMOUNT);
    await assert.rejects(
      fixture.contracts.registry.write.submitAttestation([first.data, "0x" as Hex]),
    );
  });

  it("rejects attestations that do not use the asset's registered policy", async () => {
    const fixture = await deployedFixture();
    const { verifier } = fixture.accounts;
    const block = await publicClient.getBlock();
    const data = {
      claimId: fixture.claimId,
      assetId: ASSET_ID,
      periodKey: PERIOD_AUG,
      claimedAmount: CLAIM_AMOUNT,
      verifiedAmount: CLAIM_AMOUNT,
      outcome: 1,
      evidenceRoot: fixture.evidenceRoot,
      reportHash: REPORT_HASH,
      policyHash: keccak256(stringToHex("unregistered-policy")),
      termsHash: TERMS_HASH,
      modelRunHash: MODEL_RUN_HASH,
      nonce: 0n,
      deadline: block.timestamp + 900n,
    } as const;
    const signature = await verifier.signTypedData({
      account: verifier.account!,
      domain: { name: "VeriFi Attestation Registry", version: "1", chainId: await publicClient.getChainId(), verifyingContract: fixture.contracts.registry.address },
      types: {
        Attestation: [
          { name: "claimId", type: "bytes32" }, { name: "assetId", type: "bytes32" },
          { name: "periodKey", type: "bytes32" }, { name: "claimedAmount", type: "uint256" },
          { name: "verifiedAmount", type: "uint256" }, { name: "outcome", type: "uint8" },
          { name: "evidenceRoot", type: "bytes32" }, { name: "reportHash", type: "bytes32" },
          { name: "policyHash", type: "bytes32" }, { name: "termsHash", type: "bytes32" }, { name: "modelRunHash", type: "bytes32" },
          { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" },
        ],
      },
      primaryType: "Attestation",
      message: data,
    });
    await viem.assertions.revertWithCustomError(
      fixture.contracts.registry.write.submitAttestation([data, signature]),
      fixture.contracts.registry,
      "PolicyMismatch",
    );
  });

  it("rejects an attestation whose evaluated terms differ from the registered commitment", async () => {
    const fixture = await deployedFixture();
    await assert.rejects(
      submitAttestation(
        fixture,
        1,
        CLAIM_AMOUNT,
        REPORT_HASH,
        keccak256(stringToHex("substituted-asset-terms")),
      ),
      /TermsMismatch/,
    );
  });

  it("rejects a partial VERIFIED amount so escrow cannot be stranded", async () => {
    const fixture = await deployedFixture();
    const { verifier } = fixture.accounts;
    const block = await publicClient.getBlock();
    const data = {
      claimId: fixture.claimId,
      assetId: ASSET_ID,
      periodKey: PERIOD_AUG,
      claimedAmount: CLAIM_AMOUNT,
      verifiedAmount: CLAIM_AMOUNT - 1n,
      outcome: 1,
      evidenceRoot: fixture.evidenceRoot,
      reportHash: REPORT_HASH,
      policyHash: POLICY_HASH,
      termsHash: TERMS_HASH,
      modelRunHash: MODEL_RUN_HASH,
      nonce: 0n,
      deadline: block.timestamp + 900n,
    } as const;
    const signature = await verifier.signTypedData({
      account: verifier.account!,
      domain: { name: "VeriFi Attestation Registry", version: "1", chainId: await publicClient.getChainId(), verifyingContract: fixture.contracts.registry.address },
      types: {
        Attestation: [
          { name: "claimId", type: "bytes32" }, { name: "assetId", type: "bytes32" },
          { name: "periodKey", type: "bytes32" }, { name: "claimedAmount", type: "uint256" },
          { name: "verifiedAmount", type: "uint256" }, { name: "outcome", type: "uint8" },
          { name: "evidenceRoot", type: "bytes32" }, { name: "reportHash", type: "bytes32" },
          { name: "policyHash", type: "bytes32" }, { name: "termsHash", type: "bytes32" }, { name: "modelRunHash", type: "bytes32" },
          { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" },
        ],
      },
      primaryType: "Attestation",
      message: data,
    });
    await viem.assertions.revertWithCustomError(
      fixture.contracts.registry.write.submitAttestation([data, signature]),
      fixture.contracts.registry,
      "InvalidVerifiedAmount",
    );
  });

  it("does not settle before the challenge window closes", async () => {
    const fixture = await deployedFixture();
    const { attestationId } = await submitAttestation(fixture, 1, CLAIM_AMOUNT);
    await viem.assertions.revertWithCustomError(
      fixture.contracts.registry.write.settle([attestationId]),
      fixture.contracts.registry,
      "ChallengeWindowOpen",
    );
  });

  it("does not settle a challenged attestation without resolver judgment", async () => {
    const fixture = await deployedFixture();
    const { attestationId } = await submitAttestation(fixture, 1, CLAIM_AMOUNT);
    const challengerRegistry = await viem.getContractAt(
      "AttestationRegistry",
      fixture.contracts.registry.address,
      { client: { wallet: fixture.accounts.challenger } },
    );
    await challengerRegistry.write.challenge([attestationId, EVIDENCE_FALSE], {
      value: CHALLENGER_BOND,
    });
    await passChallengeWindow();
    await viem.assertions.revertWithCustomError(
      fixture.contracts.registry.write.settle([attestationId]),
      fixture.contracts.registry,
      "AttestationNotPending",
    );
  });

  it("rejects a challenge mined exactly at the deadline", async () => {
    const fixture = await deployedFixture();
    const { attestationId } = await submitAttestation(fixture, 1, CLAIM_AMOUNT);
    const attestation = await fixture.contracts.registry.read.getAttestation([attestationId]) as {
      challengeDeadline: bigint;
    };
    const challengerRegistry = await viem.getContractAt(
      "AttestationRegistry",
      fixture.contracts.registry.address,
      { client: { wallet: fixture.accounts.challenger } },
    );
    await testClient.setNextBlockTimestamp({ timestamp: BigInt(attestation.challengeDeadline) });
    await viem.assertions.revertWithCustomError(
      challengerRegistry.write.challenge([attestationId, EVIDENCE_FALSE], {
        value: CHALLENGER_BOND,
      }),
      fixture.contracts.registry,
      "ChallengeWindowClosed",
    );
  });

  it("rejects a holder's second withdrawal for the same claim", async () => {
    const fixture = await deployedFixture();
    const { attestationId } = await submitAttestation(fixture, 1, CLAIM_AMOUNT);
    await passChallengeWindow();
    await fixture.contracts.registry.write.settle([attestationId]);
    const holderVault = await viem.getContractAt("YieldVault", fixture.contracts.vault.address, {
      client: { wallet: fixture.accounts.holderA },
    });
    await holderVault.write.claimYield([fixture.claimId]);
    await viem.assertions.revertWithCustomError(
      holderVault.write.claimYield([fixture.claimId]),
      fixture.contracts.vault,
      "AlreadyClaimed",
    );
  });

  it("refunds the issuer only after a blocked claim's delay", async () => {
    const fixture = await deployedFixture();
    const { attestationId } = await submitAttestation(fixture, 2, 0n);
    await passChallengeWindow();
    await fixture.contracts.registry.write.settle([attestationId]);
    const issuerVault = await viem.getContractAt("YieldVault", fixture.contracts.vault.address, {
      client: { wallet: fixture.accounts.issuer },
    });
    await viem.assertions.revertWithCustomError(
      issuerVault.write.refundBlockedClaim([fixture.claimId]),
      fixture.contracts.vault,
      "RefundNotReady",
    );
    await testClient.increaseTime({ seconds: 3_601 });
    await testClient.mine({ blocks: 1 });
    await issuerVault.write.refundBlockedClaim([fixture.claimId]);
    assert.equal(
      await fixture.contracts.mockUsdt.read.balanceOf([fixture.accounts.issuer.account!.address]),
      CLAIM_AMOUNT,
    );
  });

  it("pauses new risk without trapping an already-released holder withdrawal", async () => {
    const fixture = await deployedFixture();
    const { attestationId } = await submitAttestation(fixture, 1, CLAIM_AMOUNT);
    await passChallengeWindow();
    await fixture.contracts.registry.write.settle([attestationId]);
    await fixture.contracts.vault.write.pause();
    const holderVault = await viem.getContractAt("YieldVault", fixture.contracts.vault.address, {
      client: { wallet: fixture.accounts.holderA },
    });
    await holderVault.write.claimYield([fixture.claimId]);
    assert.equal(
      await fixture.contracts.mockUsdt.read.balanceOf([fixture.accounts.holderA.account!.address]),
      1_200n * USDT,
    );
  });
});
