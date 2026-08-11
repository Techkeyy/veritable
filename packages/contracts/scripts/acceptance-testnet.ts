import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { network } from "hardhat";
import {
  formatUnits,
  keccak256,
  parseUnits,
  stringToHex,
  type Address,
  type Hash,
  type Hex,
} from "viem";

const EXPECTED_CHAIN_ID = 968;
const USDT_DECIMALS = 6;
const VERIFIED_AMOUNT = parseUnits("2000", USDT_DECIMALS);
const BLOCKED_AMOUNT = parseUnits("1500", USDT_DECIMALS);
const EXPLORER = "https://scan.bohr.life";

interface Manifest {
  chainId: number;
  deploymentBlock: string;
  contracts: {
    settlementToken: Address;
    assetRegistry: Address;
    revenueShareToken: Address;
    verifierStaking: Address;
    yieldVault: Address;
    attestationRegistry: Address;
  };
  demo: { assetId: Hash; policyHash: Hash; termsHash: Hash };
  parameters: {
    verifierBondWei: string;
    challengerBondWei: string;
    challengeWindowSeconds: string;
    blockedRefundDelaySeconds: string;
  };
}

const attestationTypes = {
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
} as const;

function hashLabel(label: string): Hash {
  return keccak256(stringToHex(label));
}

async function waitForTimestamp(
  publicClient: Awaited<ReturnType<Awaited<ReturnType<typeof network.create>>["viem"]["getPublicClient"]>>,
  target: bigint,
) {
  while (true) {
    const block = await publicClient.getBlock();
    if (block.timestamp >= target) return block;
    const remaining = target - block.timestamp;
    process.stdout.write(`Waiting for BOT Testnet time gate (${remaining}s remaining)\n`);
    await new Promise((resolveWait) => setTimeout(resolveWait, Number(remaining > 5n ? 5n : remaining) * 1_000));
  }
}

const { viem, networkName } = await network.create();
if (networkName !== "botTestnet") throw new Error(`Acceptance refused on network ${networkName}`);
const publicClient = await viem.getPublicClient();
const [deployer, verifier] = await viem.getWalletClients();
if (!deployer?.account || !verifier?.account) throw new Error("Deployer and verifier wallets are required");
const chainId = await publicClient.getChainId();
if (chainId !== EXPECTED_CHAIN_ID) throw new Error(`Wrong-chain kill switch: expected ${EXPECTED_CHAIN_ID}, received ${chainId}`);

const outDir = resolve(process.cwd(), "../../deployments/bot-testnet");
const manifest = JSON.parse(await readFile(resolve(outDir, "manifest.json"), "utf8")) as Manifest;
if (manifest.chainId !== chainId) throw new Error(`Manifest chain ${manifest.chainId} does not match RPC chain ${chainId}`);

const settlement = await viem.getContractAt("MockUSDT", manifest.contracts.settlementToken, { client: { wallet: deployer } });
const vault = await viem.getContractAt("YieldVault", manifest.contracts.yieldVault, { client: { wallet: deployer } });
const registry = await viem.getContractAt("AttestationRegistry", manifest.contracts.attestationRegistry, { client: { wallet: deployer } });
const verifierRegistry = await viem.getContractAt("AttestationRegistry", manifest.contracts.attestationRegistry, { client: { wallet: verifier } });
const verifierVault = await viem.getContractAt("YieldVault", manifest.contracts.yieldVault, { client: { wallet: verifier } });
const staking = await viem.getContractAt("VerifierStaking", manifest.contracts.verifierStaking, { client: { public: publicClient } });
const verifierStakeBefore = await staking.read.freeStake([verifier.account.address]) as bigint;
const verifierBond = BigInt(manifest.parameters.verifierBondWei);
if (verifierStakeBefore < verifierBond) {
  throw new Error(`Verifier has insufficient free stake: ${verifierStakeBefore}/${verifierBond}`);
}

const runId = `${Date.now()}-${(await publicClient.getBlockNumber()).toString()}`;
const transactions: Record<string, Hash> = {};

async function confirm(name: string, hash: Hash) {
  transactions[name] = hash;
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${name} reverted: ${hash}`);
  process.stdout.write(`${name}: ${EXPLORER}/tx/${hash}\n`);
  return receipt;
}

async function submitClaim(label: string, periodKey: Hash, amount: bigint, evidenceRoot: Hash) {
  await confirm(`${label}.approve`, await settlement.write.approve([vault.address, amount]));
  await confirm(`${label}.submitClaim`, await vault.write.submitClaim([manifest.demo.assetId, periodKey, amount, evidenceRoot]));
  const claimId = await vault.read.periodClaims([manifest.demo.assetId, periodKey]) as Hash;
  if (claimId === `0x${"00".repeat(32)}`) throw new Error(`${label} did not create a claim`);
  return claimId;
}

async function attest(
  label: string,
  claimId: Hash,
  periodKey: Hash,
  amount: bigint,
  evidenceRoot: Hash,
  outcome: 1 | 2,
  verifiedAmount: bigint,
) {
  const block = await publicClient.getBlock();
  const data = {
    claimId,
    assetId: manifest.demo.assetId,
    periodKey,
    claimedAmount: amount,
    verifiedAmount,
    outcome,
    evidenceRoot,
    reportHash: hashLabel(`veritable:${runId}:${label}:deterministic-report`),
    policyHash: manifest.demo.policyHash,
    termsHash: manifest.demo.termsHash,
    modelRunHash: hashLabel("veritable:deterministic-policy-v1:no-generative-decision"),
    nonce: await registry.read.nonces([verifier.account.address]) as bigint,
    deadline: block.timestamp + 900n,
  } as const;
  const signature = await verifier.signTypedData({
    account: verifier.account,
    domain: {
      name: "VeriFi Attestation Registry",
      version: "1",
      chainId,
      verifyingContract: registry.address,
    },
    types: attestationTypes,
    primaryType: "Attestation",
    message: data,
  });
  const attestationId = await registry.read.hashAttestation([data]) as Hash;
  await confirm(`${label}.submitAttestation`, await verifierRegistry.write.submitAttestation([data, signature]));
  return { attestationId, data };
}

// Path 1: exact evidence -> verified attestation -> timeout settlement -> 60/40 holder claims.
const verifiedPeriod = hashLabel(`veritable:${runId}:period:verified`);
const verifiedEvidence = hashLabel(`veritable:${runId}:evidence:bank-signed:2000-USDT`);
const verifiedClaimId = await submitClaim("verified", verifiedPeriod, VERIFIED_AMOUNT, verifiedEvidence);
const verifiedAttestation = await attest(
  "verified",
  verifiedClaimId,
  verifiedPeriod,
  VERIFIED_AMOUNT,
  verifiedEvidence,
  1,
  VERIFIED_AMOUNT,
);
const verifiedOnchain = await registry.read.getAttestation([verifiedAttestation.attestationId]) as { challengeDeadline: bigint };
await waitForTimestamp(publicClient, BigInt(verifiedOnchain.challengeDeadline));
await confirm("verified.settle", await registry.write.settle([verifiedAttestation.attestationId]));
const holderABefore = await settlement.read.balanceOf([deployer.account.address]) as bigint;
const holderBBefore = await settlement.read.balanceOf([verifier.account.address]) as bigint;
await confirm("verified.claimHolderA", await vault.write.claimYield([verifiedClaimId]));
await confirm("verified.claimHolderB", await verifierVault.write.claimYield([verifiedClaimId]));
const holderAReceived = (await settlement.read.balanceOf([deployer.account.address]) as bigint) - holderABefore;
const holderBReceived = (await settlement.read.balanceOf([verifier.account.address]) as bigint) - holderBBefore;
if (holderAReceived !== parseUnits("1200", USDT_DECIMALS) || holderBReceived !== parseUnits("800", USDT_DECIMALS)) {
  throw new Error(`Snapshot distribution mismatch: ${holderAReceived}/${holderBReceived}`);
}

// Path 2: a deliberately false approval -> challenge -> resolver overturn -> slash -> delayed issuer refund.
const blockedPeriod = hashLabel(`veritable:${runId}:period:underpayment`);
const blockedEvidence = hashLabel(`veritable:${runId}:evidence:bank-signed:1500-USDT`);
const issuerBeforeBlocked = await settlement.read.balanceOf([deployer.account.address]) as bigint;
const blockedClaimId = await submitClaim("challenge", blockedPeriod, BLOCKED_AMOUNT, blockedEvidence);
const falseAttestation = await attest(
  "challenge.falseApproval",
  blockedClaimId,
  blockedPeriod,
  BLOCKED_AMOUNT,
  blockedEvidence,
  1,
  BLOCKED_AMOUNT,
);
const counterEvidenceRoot = hashLabel(`veritable:${runId}:counter-evidence:expected-2000-received-1500`);
await confirm(
  "challenge.challenge",
  await registry.write.challenge([falseAttestation.attestationId, counterEvidenceRoot], {
    value: BigInt(manifest.parameters.challengerBondWei),
  }),
);
await confirm("challenge.resolveOverturn", await registry.write.resolve([falseAttestation.attestationId, false, 2, 0n]));
const blockedClaim = await vault.read.getClaim([blockedClaimId]) as { resolvedAt: bigint; status: number };
await waitForTimestamp(publicClient, BigInt(blockedClaim.resolvedAt) + BigInt(manifest.parameters.blockedRefundDelaySeconds));
await confirm("challenge.refundIssuer", await vault.write.refundBlockedClaim([blockedClaimId]));
const issuerAfterRefund = await settlement.read.balanceOf([deployer.account.address]) as bigint;
if (issuerAfterRefund !== issuerBeforeBlocked) throw new Error("Blocked issuer refund did not restore the escrow amount");

const falseAttestationAfter = await registry.read.getAttestation([falseAttestation.attestationId]) as { status: number };
const verifiedClaimAfter = await vault.read.getClaim([verifiedClaimId]) as { status: number };
const blockedClaimAfter = await vault.read.getClaim([blockedClaimId]) as { status: number };
const freeStakeAfter = await staking.read.freeStake([verifier.account.address]) as bigint;
const expectedStakeAfterSlash = verifierStakeBefore - verifierBond;
if (verifiedClaimAfter.status !== 2 || blockedClaimAfter.status !== 4 || falseAttestationAfter.status !== 3) {
  throw new Error("Final protocol states do not match RELEASED/REFUNDED/SETTLED");
}
if (freeStakeAfter !== expectedStakeAfterSlash) throw new Error(`Expected 3 tBOT stake after slash, received ${freeStakeAfter}`);

const acceptanceBlock = await publicClient.getBlockNumber();
const result = {
  schemaVersion: 1,
  network: "bot-testnet",
  chainId,
  runId,
  acceptedAt: new Date().toISOString(),
  deploymentBlock: manifest.deploymentBlock,
  acceptanceBlock: acceptanceBlock.toString(),
  explorer: EXPLORER,
  contracts: manifest.contracts,
  actors: { issuerAndHolderA: deployer.account.address, verifierAndHolderB: verifier.account.address },
  paths: {
    verified: {
      claimId: verifiedClaimId,
      attestationId: verifiedAttestation.attestationId,
      outcome: "RELEASED",
      holderAReceived: formatUnits(holderAReceived, USDT_DECIMALS),
      holderBReceived: formatUnits(holderBReceived, USDT_DECIMALS),
    },
    challengedFalseApproval: {
      claimId: blockedClaimId,
      attestationId: falseAttestation.attestationId,
      outcome: "REFUNDED_AFTER_OVERTURN",
      verifierStakeBeforeWei: verifierStakeBefore.toString(),
      verifierStakeAfterSlashWei: freeStakeAfter.toString(),
    },
  },
  transactions: Object.fromEntries(
    Object.entries(transactions).map(([name, hash]) => [name, { hash, explorerUrl: `${EXPLORER}/tx/${hash}` }]),
  ),
  secretsIncluded: false,
} as const;

await mkdir(outDir, { recursive: true });
const destination = resolve(outDir, "acceptance.json");
const temporary = `${destination}.tmp`;
await writeFile(temporary, `${JSON.stringify(result, null, 2)}\n`, "utf8");
await rename(temporary, destination);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
