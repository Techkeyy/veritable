import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { resolve } from "node:path";

import { attestationRequestMessage as appAttestationRequestMessage } from "../apps/web/src/lib/attestationRequest.ts";
import { evidencePreparationMessage as appEvidencePreparationMessage } from "../apps/web/src/lib/evidenceAuthorization.ts";
import {
  FAILED_MAINNET_ASSET_ID,
  MAINNET_DEPLOYER_GAS_UNITS,
  MAINNET_ISSUER_GAS_UNITS,
  MAINNET_ISSUER_FUNDING_WEI,
  MAINNET_ISSUER_RECOVERY_MARGIN_WEI,
  MAINNET_MAX_GAS_PRICE_WEI,
  MAINNET_PAYER_SAFETY_MARGIN_WEI,
  TESTNET_ISSUER_FUNDING_WEI,
  assertCanonicalAssetFresh,
  assertCanonicalExtractionMatches,
  assertCanonicalMainnetAmount,
  assertMainnetGasPrice,
  assertMainnetPreSpendState,
  assertRecoveryPersisted,
  assertSafeHostedBaseUrl,
  assertSelectedDeployment,
  attestationRequestMessage,
  canonicalRunIdentity,
  evidencePreparationMessage,
  issuerFundingForNetwork,
  mainnetPayerReserve,
} from "./canonical-claim-safety.mjs";

const requester = "0xCc67779F8eDb2C80DC665775C5597657C512FE1A" as const;
const documentHash = `0x${"11".repeat(32)}` as const;
const claimId = `0x${"22".repeat(32)}`;

for (const network of [
  { name: "Testnet", id: 968, label: "BOT Testnet" },
  { name: "Mainnet", id: 677, label: "BOT Mainnet" },
]) {
  test(`${network.name} evidence authorization matches the application helper byte-for-byte`, () => {
    const input = {
      requester,
      periodKey: "2026-08",
      proofReference: `BOT_TRANSACTION:0x${"33".repeat(32)}`,
      documentHash,
      chainId: network.id,
    };
    const actual = evidencePreparationMessage(input);
    assert.equal(actual, appEvidencePreparationMessage(input));
    assert.match(actual, new RegExp(`Chain ID: ${network.id}$`));
  });

  test(`${network.name} attestation authorization matches the application helper byte-for-byte`, () => {
    const actual = attestationRequestMessage(claimId, network.id, network.label);
    assert.equal(actual, appAttestationRequestMessage(claimId, network.id, network.label));
    assert.match(actual, new RegExp(`^Veritable ${network.label} attestation request`));
    assert.match(actual, new RegExp(`Chain: ${network.id}`));
  });
}

test("Mainnet refuses the protected Testnet host", () => {
  for (const site of [
    "https://veritable-web-sigma.vercel.app",
    "https://veritable-web-sigma.vercel.app/",
    "https://veritable-web-sigma.vercel.app/v1/evidence/prepare",
    "https://veritable-web-sigma.vercel.app?network=mainnet",
    "https://veritable-web-sigma.vercel.app/v1/evidence/prepare?network=mainnet",
  ]) {
    assert.throws(
      () => assertSafeHostedBaseUrl({ mainnet: true, site }),
      /separate Mainnet host/,
    );
  }
  assert.doesNotThrow(() => assertSafeHostedBaseUrl({ mainnet: false, site: "https://veritable-web-sigma.vercel.app" }));
});

test("issuer funding remains network-aware", () => {
  assert.equal(MAINNET_ISSUER_GAS_UNITS * MAINNET_MAX_GAS_PRICE_WEI, 55_889_650_000_000_000n);
  assert.equal(MAINNET_ISSUER_RECOVERY_MARGIN_WEI, 1_500_000_000_000_000n);
  assert.equal(issuerFundingForNetwork(true), 57_389_650_000_000_000n);
  assert.equal(issuerFundingForNetwork(true), MAINNET_ISSUER_FUNDING_WEI);
  assert.equal(issuerFundingForNetwork(false), 120_000_000_000_000_000n);
  assert.equal(issuerFundingForNetwork(false), TESTNET_ISSUER_FUNDING_WEI);
});

test("Mainnet payer reserve is derived from funding, measured gas, and margin", () => {
  assert.equal(MAINNET_DEPLOYER_GAS_UNITS, 21_000n + 51_266n + 91_054n);
  assert.equal(MAINNET_DEPLOYER_GAS_UNITS * MAINNET_MAX_GAS_PRICE_WEI, 4_083_000_000_000_000n);
  assert.equal(MAINNET_PAYER_SAFETY_MARGIN_WEI, 1_500_000_000_000_000n);
  assert.equal(mainnetPayerReserve(), 62_972_650_000_000_000n);
  assert.notEqual(mainnetPayerReserve(), 74_083_000_000_000_000n);
});

test("Mainnet replacement identity is explicit, deterministic, and distinct from the failed asset", () => {
  assert.throws(
    () => canonicalRunIdentity({ mainnet: true, runLabel: undefined, issuerAddress: requester }),
    /CANONICAL_RUN_LABEL/,
  );
  assert.throws(
    () => canonicalRunIdentity({ mainnet: true, runLabel: "Mainnet R2", issuerAddress: requester }),
    /lowercase letters/,
  );
  const identity = canonicalRunIdentity({ mainnet: true, runLabel: "mainnet-r2-20260821", issuerAddress: requester });
  assert.equal(identity.propertyName, "Unit 4B, 118 Harbour Road [mainnet-r2-20260821]");
  assert.notEqual(identity.assetId, FAILED_MAINNET_ASSET_ID);
  assert.deepEqual(identity, canonicalRunIdentity({ mainnet: true, runLabel: "mainnet-r2-20260821", issuerAddress: requester }));
});

test("canonical asset preflight refuses the failed, registered, or previously claimed identity", () => {
  const candidateAssetId = `0x${"44".repeat(32)}`;
  assert.doesNotThrow(() => assertCanonicalAssetFresh({
    mainnet: true,
    candidateAssetId,
    registeredIssuer: "0x0000000000000000000000000000000000000000",
    existingClaimId: `0x${"00".repeat(32)}`,
  }));
  assert.throws(() => assertCanonicalAssetFresh({ mainnet: true, candidateAssetId: FAILED_MAINNET_ASSET_ID, registeredIssuer: "0x0000000000000000000000000000000000000000", existingClaimId: `0x${"00".repeat(32)}` }), /failed Mainnet asset/);
  assert.throws(() => assertCanonicalAssetFresh({ mainnet: true, candidateAssetId, registeredIssuer: requester, existingClaimId: `0x${"00".repeat(32)}` }), /already exists/);
  assert.throws(() => assertCanonicalAssetFresh({ mainnet: true, candidateAssetId, registeredIssuer: "0x0000000000000000000000000000000000000000", existingClaimId: claimId }), /already has a claim/);
});

test("final Mainnet amount is exactly 0.01 USDT and splits 60/40 without dust", () => {
  assert.deepEqual(
    assertCanonicalMainnetAmount({ mainnet: true, amountMinor: 10_000n }),
    { holder60Minor: 6_000n, holder40Minor: 4_000n },
  );
  assert.throws(() => assertCanonicalMainnetAmount({ mainnet: true, amountMinor: 500_000n }), /CANONICAL_AMOUNT=0.01/);
  assert.doesNotThrow(() => assertCanonicalMainnetAmount({ mainnet: false, amountMinor: 2_000_000_000n }));
});

test("canonical extraction gate accepts only complete exact terms", () => {
  const assetTerms = { expectedAmountMinor: "10000", dueDate: "2026-08-21" };
  const bundle = (extractedFacts?: { expectedAmountMinor?: string; dueDate?: string }) => ({
    documents: [{ id: "deepseek:test:income.txt", extractedFacts }],
  });
  assert.deepEqual(
    assertCanonicalExtractionMatches({ bundle: bundle(assetTerms), assetTerms }),
    assetTerms,
  );
  assert.throws(
    () => assertCanonicalExtractionMatches({ bundle: bundle({ dueDate: assetTerms.dueDate }), assetTerms }),
    /complete extracted amount and due date/,
  );
  assert.throws(
    () => assertCanonicalExtractionMatches({ bundle: bundle({ expectedAmountMinor: "9999", dueDate: assetTerms.dueDate }), assetTerms }),
    /amount does not match/,
  );
  assert.throws(
    () => assertCanonicalExtractionMatches({ bundle: bundle({ expectedAmountMinor: assetTerms.expectedAmountMinor, dueDate: "2026-08-20" }), assetTerms }),
    /due date does not match/,
  );
});

test("Mainnet gas-price ceiling passes at or below 25 gwei and fails closed above it", () => {
  assert.doesNotThrow(() => assertMainnetGasPrice({ mainnet: true, gasPrice: 20_000_000_000n }));
  assert.doesNotThrow(() => assertMainnetGasPrice({ mainnet: true, gasPrice: MAINNET_MAX_GAS_PRICE_WEI }));
  assert.throws(
    () => assertMainnetGasPrice({ mainnet: true, gasPrice: MAINNET_MAX_GAS_PRICE_WEI + 1n }),
    /stop and recalculate the BOT budget/,
  );
  assert.throws(
    () => assertMainnetGasPrice({ mainnet: true, gasPrice: undefined }),
    /positive live Mainnet gas price/,
  );
  assert.doesNotThrow(() => assertMainnetGasPrice({ mainnet: false, gasPrice: MAINNET_MAX_GAS_PRICE_WEI + 1n }));
});

test("the canonical script itself exits on the protected Testnet host before reaching spend steps", () => {
  const child = spawnSync(process.execPath, ["scripts/canonical-claim.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, CHAIN_ENV: "bot-mainnet", HOSTED_TEST_BASE_URL: "https://veritable-web-sigma.vercel.app" },
    encoding: "utf8",
  });
  assert.notEqual(child.status, 0);
  assert.match(child.stderr, /protected Testnet deployment/);
  assert.doesNotMatch(child.stdout, /Funding fresh issuer wallet/);
});

test("Mainnet refuses a chain-ID mismatch", () => {
  assert.throws(
    () => assertSelectedDeployment({ mainnet: true, actualChainId: 968, expectedChainId: 677, manifestChainId: 677, manifestNetwork: "bot-mainnet" }),
    /does not match selected chain/,
  );
});

test("Mainnet refuses missing recovery state", () => {
  assert.throws(() => assertRecoveryPersisted(false), /recovery state/);
  assert.doesNotThrow(() => assertRecoveryPersisted(true));
});

test("Mainnet pre-spend accepts the planned 0.06299782 BOT / 0.010804 USDT state and fails closed for each invariant", () => {
  const valid = {
    mainnet: true,
    configuredSettlementToken: "0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C",
    settlementTokenDecimals: 6,
    missingCode: [] as string[],
    freeStake: 600_000_000_000_000_000n,
    requiredBond: 200_000_000_000_000_000n,
    payerBotBalance: 62_997_820_000_000_000n,
    minimumPayerBotBalance: mainnetPayerReserve(),
    gasPrice: 20_000_000_000n,
    payerUsdtBalance: 10_804n,
    requiredUsdt: 10_000n,
    payerAddress: requester,
    manifestDeployer: requester,
    verifierAddress: "0x2EDc775221FE928c252bc570FEcfd6E1a1F135AC",
    manifestVerifier: "0x2EDc775221FE928c252bc570FEcfd6E1a1F135AC",
  };
  assert.doesNotThrow(() => assertMainnetPreSpendState(valid));
  for (const [change, pattern] of [
    [{ configuredSettlementToken: requester }, /official USDT/],
    [{ settlementTokenDecimals: 18 }, /6 decimals/],
    [{ missingCode: ["yieldVault"] }, /Missing deployed bytecode/],
    [{ freeStake: 199_999_999_999_999_999n }, /below the required bond/],
    [{ payerBotBalance: mainnetPayerReserve() - 1n }, /BOT balance/],
    [{ gasPrice: MAINNET_MAX_GAS_PRICE_WEI + 1n }, /stop and recalculate/],
    [{ payerUsdtBalance: 9_999n }, /USDT balance/],
    [{ payerAddress: "0x3A3DFC22820d1B0d6d0aD4D7438720c0D3d4dD07" }, /recorded deployer/],
    [{ verifierAddress: requester }, /verifier role/],
  ] as const) {
    assert.throws(() => assertMainnetPreSpendState({ ...valid, ...change }), pattern);
  }
});

test("recovery persistence and Mainnet guards precede every transaction-capable call", async () => {
  const source = await readFile(resolve(process.cwd(), "scripts/canonical-claim.mjs"), "utf8");
  const recovery = source.indexOf("await persistIssuerRecovery()");
  const preSpend = source.indexOf("await runPreSpendChecks()");
  const freshness = source.lastIndexOf("assertCanonicalAssetFresh({");
  const firstSend = source.indexOf(".sendTransaction(");
  const firstWrite = source.indexOf(".writeContract(");
  assert.ok(recovery >= 0, "issuer recovery persistence call is present");
  assert.ok(preSpend > recovery, "recovery persistence is part of the pre-spend control flow");
  assert.ok(freshness > recovery && freshness < preSpend, "asset and period freshness is checked inside pre-spend control flow");
  assert.ok(firstSend > preSpend, "sendTransaction cannot occur before recovery and pre-spend checks");
  assert.ok(firstWrite > preSpend, "writeContract cannot occur before recovery and pre-spend checks");
  assert.match(source, /Object\.entries\(manifest\.contracts\)/, "every configured deployment address is checked");
  assert.match(source, /publicClient\.getCode/, "configured deployment addresses are checked for bytecode");
  assert.match(source, /publicClient\.getGasPrice\(\)/, "live gas price is read before value movement");
  assert.match(source, /issuerFundingForNetwork\(MAINNET\)/, "issuer funding is selected explicitly by network");
  assert.match(source, /mainnetPayerReserve\(\)/, "Mainnet payer minimum is derived from named components");
  assert.doesNotMatch(source, /parseEther\("0\.14"\)/, "the old hardcoded 0.14 BOT minimum is absent");
  assert.doesNotMatch(source, /60_000_000_000_000_000n/, "the superseded 0.060 BOT issuer funding is absent");
  assert.doesNotMatch(source, /74_083_000_000_000_000n/, "the superseded 0.074083 BOT reserve is absent");
  const canonicalGate = source.indexOf("assertCanonicalExtractionMatches({ bundle, assetTerms })");
  const assetCreation = source.indexOf("const assetCreationReceipt");
  const approval = source.indexOf('confirm("approveEscrow"');
  const claimSubmission = source.indexOf("const claimSubmissionReceipt");
  assert.ok(canonicalGate >= 0, "canonical extraction assertion is present");
  assert.ok(assetCreation > canonicalGate, "asset creation is unreachable until canonical extraction passes");
  assert.ok(approval > canonicalGate, "approval is unreachable until canonical extraction passes");
  assert.ok(claimSubmission > canonicalGate, "claim submission is unreachable until canonical extraction passes");
  for (const stage of [
    "ISSUER_GENERATED",
    "ISSUER_FUNDED",
    "INCOME_PAYMENT_MADE",
    "EVIDENCE_PREPARED",
    "ASSET_CREATED",
    "CLAIM_SUBMITTED",
  ]) {
    assert.match(source, new RegExp(`persistIssuerRecoveryStage\\(\"${stage}\"`), `${stage} is durably tracked`);
  }
  const ignore = await readFile(resolve(process.cwd(), ".gitignore"), "utf8");
  assert.match(ignore, /^\.verifi\/$/m, "recovery files remain inside the established gitignored boundary");
});
