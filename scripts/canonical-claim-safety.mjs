import { getAddress } from "viem";

export const KNOWN_TESTNET_SITE = "https://veritable-web-sigma.vercel.app";
export const BOT_MAINNET_USDT = getAddress("0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C");

// The disposable issuer pays createAsset, approval, claim submission,
// settlement, and its holder withdrawal. The measured Mainnet cost for those
// calls is 2,235,586 gas, or 0.04471172 BOT at 20 gwei. Funding it with 0.060
// BOT preserves about 34% headroom at the current gas price.
export const MAINNET_ISSUER_FUNDING_WEI = 60_000_000_000_000_000n;
export const TESTNET_ISSUER_FUNDING_WEI = 120_000_000_000_000_000n;

// The deployer pays the issuer-funding transfer, USDT payment, and its holder
// withdrawal: 21,000 + 51,266 + 91,054 measured gas units.
export const MAINNET_DEPLOYER_GAS_UNITS = 163_320n;
export const MAINNET_MAX_GAS_PRICE_WEI = 25_000_000_000n;
export const MAINNET_PAYER_SAFETY_MARGIN_WEI = 10_000_000_000_000_000n;

export function issuerFundingForNetwork(mainnet) {
  return mainnet ? MAINNET_ISSUER_FUNDING_WEI : TESTNET_ISSUER_FUNDING_WEI;
}

export function mainnetPayerReserve() {
  const deployerGasAllowance = MAINNET_DEPLOYER_GAS_UNITS * MAINNET_MAX_GAS_PRICE_WEI;
  return MAINNET_ISSUER_FUNDING_WEI + deployerGasAllowance + MAINNET_PAYER_SAFETY_MARGIN_WEI;
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
  recoveryPersisted,
}) {
  if (!mainnet) return;
  assertMainnetGasPrice({ mainnet, gasPrice });
  if (getAddress(configuredSettlementToken) !== BOT_MAINNET_USDT) {
    throw new Error(`Mainnet settlement token must be official USDT at ${BOT_MAINNET_USDT}`);
  }
  if (settlementTokenDecimals !== 6) {
    throw new Error(`Mainnet USDT must use 6 decimals, received ${settlementTokenDecimals}`);
  }
  if (missingCode.length > 0) {
    throw new Error(`Missing deployed bytecode: ${missingCode.join(", ")}`);
  }
  if (freeStake < requiredBond) {
    throw new Error(`Verifier free stake ${freeStake} is below the required bond ${requiredBond}`);
  }
  if (payerBotBalance < minimumPayerBotBalance) {
    throw new Error(`Funding wallet BOT balance ${payerBotBalance} is below the guarded minimum ${minimumPayerBotBalance}`);
  }
  if (payerUsdtBalance < requiredUsdt) {
    throw new Error(`Funding wallet USDT balance ${payerUsdtBalance} is below the claim amount ${requiredUsdt}`);
  }
  if (getAddress(payerAddress) !== getAddress(manifestDeployer)) {
    throw new Error("Funding wallet does not match the selected Mainnet deployment's recorded deployer");
  }
  if (getAddress(verifierAddress) !== getAddress(manifestVerifier)) {
    throw new Error("Verifier wallet does not match the selected Mainnet deployment's verifier role");
  }
  if (!recoveryPersisted) {
    throw new Error("Disposable issuer recovery state was not durably persisted before spend checks");
  }
}
