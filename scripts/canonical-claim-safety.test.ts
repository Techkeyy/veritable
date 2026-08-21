import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { resolve } from "node:path";

import { attestationRequestMessage as appAttestationRequestMessage } from "../apps/web/src/lib/attestationRequest.ts";
import { evidencePreparationMessage as appEvidencePreparationMessage } from "../apps/web/src/lib/evidenceAuthorization.ts";
import {
  MAINNET_ISSUER_FUNDING_WEI,
  MAINNET_MAX_GAS_PRICE_WEI,
  TESTNET_ISSUER_FUNDING_WEI,
  assertCanonicalExtractionMatches,
  assertMainnetGasPrice,
  assertMainnetPreSpendState,
  assertSafeHostedBaseUrl,
  assertSelectedDeployment,
  attestationRequestMessage,
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
  assert.equal(issuerFundingForNetwork(true), 60_000_000_000_000_000n);
  assert.equal(issuerFundingForNetwork(true), MAINNET_ISSUER_FUNDING_WEI);
  assert.equal(issuerFundingForNetwork(false), 120_000_000_000_000_000n);
  assert.equal(issuerFundingForNetwork(false), TESTNET_ISSUER_FUNDING_WEI);
});

test("Mainnet payer reserve is derived from funding, measured gas, and margin", () => {
  assert.equal(mainnetPayerReserve(), 74_083_000_000_000_000n);
  assert.notEqual(mainnetPayerReserve(), 140_000_000_000_000_000n);
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
  const valid = {
    mainnet: true,
    configuredSettlementToken: "0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C",
    settlementTokenDecimals: 6,
    missingCode: [],
    freeStake: 600_000_000_000_000_000n,
    requiredBond: 200_000_000_000_000_000n,
    payerBotBalance: 150_000_000_000_000_000n,
    minimumPayerBotBalance: mainnetPayerReserve(),
    gasPrice: 20_000_000_000n,
    payerUsdtBalance: 500_000n,
    requiredUsdt: 500_000n,
    payerAddress: requester,
    manifestDeployer: requester,
    verifierAddress: "0x2EDc775221FE928c252bc570FEcfd6E1a1F135AC",
    manifestVerifier: "0x2EDc775221FE928c252bc570FEcfd6E1a1F135AC",
    recoveryPersisted: true,
  };
  assert.throws(
    () => assertMainnetPreSpendState({
      ...valid,
      recoveryPersisted: false,
    }),
    /recovery state/,
  );
});

test("Mainnet pre-spend accepts the hypothetical 0.092 BOT / 0.5 USDT post-swap state and fails closed for each invariant", () => {
  const valid = {
    mainnet: true,
    configuredSettlementToken: "0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C",
    settlementTokenDecimals: 6,
    missingCode: [] as string[],
    freeStake: 600_000_000_000_000_000n,
    requiredBond: 200_000_000_000_000_000n,
    payerBotBalance: 92_000_000_000_000_000n,
    minimumPayerBotBalance: mainnetPayerReserve(),
    gasPrice: 20_000_000_000n,
    payerUsdtBalance: 500_000n,
    requiredUsdt: 500_000n,
    payerAddress: requester,
    manifestDeployer: requester,
    verifierAddress: "0x2EDc775221FE928c252bc570FEcfd6E1a1F135AC",
    manifestVerifier: "0x2EDc775221FE928c252bc570FEcfd6E1a1F135AC",
    recoveryPersisted: true,
  };
  assert.doesNotThrow(() => assertMainnetPreSpendState(valid));
  for (const [change, pattern] of [
    [{ configuredSettlementToken: requester }, /official USDT/],
    [{ settlementTokenDecimals: 18 }, /6 decimals/],
    [{ missingCode: ["yieldVault"] }, /Missing deployed bytecode/],
    [{ freeStake: 199_999_999_999_999_999n }, /below the required bond/],
    [{ payerBotBalance: mainnetPayerReserve() - 1n }, /BOT balance/],
    [{ gasPrice: MAINNET_MAX_GAS_PRICE_WEI + 1n }, /stop and recalculate/],
    [{ payerUsdtBalance: 499_999n }, /USDT balance/],
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
  const firstSend = source.indexOf(".sendTransaction(");
  const firstWrite = source.indexOf(".writeContract(");
  assert.ok(recovery >= 0, "issuer recovery persistence call is present");
  assert.ok(preSpend > recovery, "pre-spend checks run after recovery persistence");
  assert.ok(firstSend > preSpend, "sendTransaction cannot occur before recovery and pre-spend checks");
  assert.ok(firstWrite > preSpend, "writeContract cannot occur before recovery and pre-spend checks");
  assert.match(source, /Object\.entries\(manifest\.contracts\)/, "every configured deployment address is checked");
  assert.match(source, /publicClient\.getCode/, "configured deployment addresses are checked for bytecode");
  assert.match(source, /publicClient\.getGasPrice\(\)/, "live gas price is read before value movement");
  assert.match(source, /issuerFundingForNetwork\(MAINNET\)/, "issuer funding is selected explicitly by network");
  assert.match(source, /mainnetPayerReserve\(\)/, "Mainnet payer minimum is derived from named components");
  assert.doesNotMatch(source, /parseEther\("0\.14"\)/, "the old hardcoded 0.14 BOT minimum is absent");
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
