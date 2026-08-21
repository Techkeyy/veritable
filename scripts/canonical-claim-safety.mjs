import { getAddress, keccak256, stringToHex, zeroAddress, zeroHash } from "viem";

export const KNOWN_TESTNET_SITE = "https://veritable-web-sigma.vercel.app";
export const BOT_MAINNET_USDT = getAddress("0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C");

export const FAILED_MAINNET_ASSET_ID = "0x744a742588d6850b0c5d910b4f5f561ae46666995933700d2e333e2840c3eae3";
export const MAINNET_ISSUER_GAS_UNITS = 2_235_586n;
export const MAINNET_MAX_GAS_PRICE_WEI = 25_000_000_000n;
export const MAINNET_ISSUER_RECOVERY_MARGIN_WEI = 1_500_000_000_000_000n;
// Price the measured issuer-paid flow at the fail-closed gas ceiling and retain
// an explicit recovery margin in the disposable wallet.
export const MAINNET_ISSUER_FUNDING_WEI = (
  MAINNET_ISSUER_GAS_UNITS * MAINNET_MAX_GAS_PRICE_WEI
) + MAINNET_ISSUER_RECOVERY_MARGIN_WEI;
export const TESTNET_ISSUER_FUNDING_WEI = 120_000_000_000_000_000n;

// The deployer pays the issuer-funding transfer, USDT payment, and its holder
// withdrawal: 21,000 + 51,266 + 91,054 measured gas units.
export const MAINNET_DEPLOYER_GAS_UNITS = 163_320n;
export const MAINNET_PAYER_SAFETY_MARGIN_WEI = 1_500_000_000_000_000n;

export function issuerFundingForNetwork(mainnet) {
  return mainnet ? MAINNET_ISSUER_FUNDING_WEI : TESTNET_ISSUER_FUNDING_WEI;
}

export function mainnetPayerReserve() {
  const deployerGasAllowance = MAINNET_DEPLOYER_GAS_UNITS * MAINNET_MAX_GAS_PRICE_WEI;
  return MAINNET_ISSUER_FUNDING_WEI + deployerGasAllowance + MAINNET_PAYER_SAFETY_MARGIN_WEI;
}

export function canonicalRunIdentity({ mainnet, runLabel, issuerAddress }) {
  if (!runLabel) {
    if (mainnet) throw new Error("Mainnet canonical runs require an explicit CANONICAL_RUN_LABEL");
    const propertyName = "Unit 4B, 118 Harbour Road";
    const assetLabel = `asset:veritable-canonical-${getAddress(issuerAddress).slice(2, 10).toLowerCase()}`;
    return { runLabel: undefined, propertyName, assetLabel, assetId: keccak256(stringToHex(assetLabel)) };
  }
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(runLabel)) {
    throw new Error("CANONICAL_RUN_LABEL must be 3-64 lowercase letters, numbers, or hyphens");
  }
  const propertyName = `Unit 4B, 118 Harbour Road [${runLabel}]`;
  return {
    runLabel,
    propertyName,
    assetLabel: `property:${propertyName}`,
    assetId: keccak256(stringToHex(propertyName)),
  };
}

export function assertCanonicalAssetFresh({ mainnet, candidateAssetId, registeredIssuer, existingClaimId }) {
  if (mainnet && candidateAssetId.toLowerCase() === FAILED_MAINNET_ASSET_ID) {
    throw new Error("Replacement canonical asset ID matches the failed Mainnet asset");
  }
  if (getAddress(registeredIssuer) !== zeroAddress) {
    throw new Error(`Canonical asset ${candidateAssetId} already exists; existing-state continuation is not supported`);
  }
  if (existingClaimId !== zeroHash) {
    throw new Error(`Canonical asset ${candidateAssetId} already has a claim for the selected period`);
  }
}

export function assertCanonicalMainnetAmount({ mainnet, amountMinor }) {
  if (mainnet && amountMinor !== 10_000n) {
    throw new Error("The final Mainnet replacement run requires CANONICAL_AMOUNT=0.01 (10000 USDT minor units)");
  }
  if (amountMinor % 5n !== 0n) {
    throw new Error("Canonical amount does not split 60/40 without rounding dust");
  }
  return { holder60Minor: (amountMinor * 3n) / 5n, holder40Minor: (amountMinor * 2n) / 5n };
}

export function assertRecoveryPersisted(recoveryPersisted) {
  if (!recoveryPersisted) {
    throw new Error("Disposable issuer recovery state was not durably persisted before value movement");
  }
}

export function assertCanonicalExtractionMatches({ bundle, assetTerms }) {
  const document = bundle?.documents?.find((candidate) => candidate?.id?.startsWith("deepseek:"));
  const facts = document?.extractedFacts;
  if (!facts?.expectedAmountMinor || !facts.dueDate) {
    throw new Error("Canonical evidence requires complete extracted amount and due date before on-chain commitment");
  }
  if (facts.expectedAmountMinor !== assetTerms.expectedAmountMinor) {
    throw new Error("Canonical extracted amount does not match the intended registered amount");
  }
  if (facts.dueDate !== assetTerms.dueDate) {
    throw new Error("Canonical extracted due date does not match the intended registered due date");
  }
  return facts;
}

export function assertMainnetGasPrice({ mainnet, gasPrice }) {
  if (!mainnet) return;
  if (typeof gasPrice !== "bigint" || gasPrice <= 0n) {
    throw new Error("A positive live Mainnet gas price is required before value movement");
  }
  if (gasPrice > MAINNET_MAX_GAS_PRICE_WEI) {
    throw new Error(
      `Mainnet gas price ${gasPrice} exceeds the 25 gwei issuer-funding safety ceiling; stop and recalculate the BOT budget`,
    );
  }
}

export function evidencePreparationMessage(input) {
  return [
    "Veritable evidence preparation",
    `Requester: ${getAddress(input.requester)}`,
    `Period: ${input.periodKey}`,
    `Payment proof: ${input.proofReference}`,
    `Document hash: ${input.documentHash}`,
    `Chain ID: ${input.chainId}`,
  ].join("\n");
}

export function attestationRequestMessage(claimId, chainId, networkName) {
  return [
    `Veritable ${networkName} attestation request`,
    `Claim: ${claimId}`,
    `Chain: ${chainId}`,
    "Purpose: authorize the bonded verifier to inspect this claim's committed evidence.",
  ].join("\n");
}

export function assertSafeHostedBaseUrl({ mainnet, site }) {
  if (!mainnet) return;
  const hostname = new URL(site).hostname.toLowerCase();
  const protectedHostname = new URL(KNOWN_TESTNET_SITE).hostname.toLowerCase();
  if (hostname === protectedHostname) {
    throw new Error("Mainnet canonical runs must use a separate Mainnet host, not the protected Testnet deployment");
  }
}

export function assertSelectedDeployment({ mainnet, actualChainId, expectedChainId, manifestChainId, manifestNetwork }) {
  if (actualChainId !== expectedChainId) {
    throw new Error(`RPC chain ID ${actualChainId} does not match selected chain ${expectedChainId}`);
  }
  const expectedNetwork = mainnet ? "bot-mainnet" : "bot-testnet";
  if (manifestChainId !== expectedChainId || manifestNetwork !== expectedNetwork) {
    throw new Error(`Deployment manifest does not match ${expectedNetwork} chain ${expectedChainId}`);
  }
  if (mainnet && actualChainId !== 677) {
    throw new Error(`Mainnet canonical runs require chain 677, received ${actualChainId}`);
  }
}

export function assertMainnetPreSpendState({
  mainnet,
  configuredSettlementToken,
  settlementTokenDecimals,
  missingCode,
  freeStake,
  requiredBond,
  payerBotBalance,
  minimumPayerBotBalance,
  gasPrice,
  payerUsdtBalance,
  requiredUsdt,
  payerAddress,
  manifestDeployer,
  verifierAddress,
  manifestVerifier,
}) {
  if (!mainnet) return;
  if (getAddress(configuredSettlementToken) !== BOT_MAINNET_USDT) {
    throw new Error(`Mainnet settlement token must be official USDT at ${BOT_MAINNET_USDT}`);
  }
  if (settlementTokenDecimals !== 6) {
    throw new Error(`Mainnet USDT must use 6 decimals, received ${settlementTokenDecimals}`);
  }
  if (missingCode.length > 0) {
    throw new Error(`Missing deployed bytecode: ${missingCode.join(", ")}`);
  }
  if (getAddress(payerAddress) !== getAddress(manifestDeployer)) {
    throw new Error("Funding wallet does not match the selected Mainnet deployment's recorded deployer");
  }
  if (getAddress(verifierAddress) !== getAddress(manifestVerifier)) {
    throw new Error("Verifier wallet does not match the selected Mainnet deployment's verifier role");
  }
  if (freeStake < requiredBond) {
    throw new Error(`Verifier free stake ${freeStake} is below the required bond ${requiredBond}`);
  }
  assertMainnetGasPrice({ mainnet, gasPrice });
  if (payerBotBalance < minimumPayerBotBalance) {
    throw new Error(`Funding wallet BOT balance ${payerBotBalance} is below the guarded minimum ${minimumPayerBotBalance}`);
  }
  if (payerUsdtBalance < requiredUsdt) {
    throw new Error(`Funding wallet USDT balance ${payerUsdtBalance} is below the claim amount ${requiredUsdt}`);
  }
}
