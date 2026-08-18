import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createPublicClient, defineChain, getAddress, http, type Address, type Hash } from "viem";

const root = process.cwd();
const site = "https://veritable-web-sigma.vercel.app";
const canonicalClaim = "0x1b547def2d1d6be5c508e357650fdd7366bd21b1b44ceb11c4e503b6d7a69c1a";
const chain = defineChain({
  id: 968,
  name: "BOT Chain Testnet",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.bohr.life"] } },
  blockExplorers: { default: { name: "BOTScan Testnet", url: "https://scan.bohr.life" } },
  testnet: true,
});
const client = createPublicClient({ chain, transport: http(process.env.BOT_TESTNET_RPC_URL ?? "https://rpc.bohr.life") });

type Manifest = {
  chainId: number;
  deployer: Address;
  contracts: Record<string, Address>;
  transactions: Record<string, Hash>;
  marketplaceDeployment: { legacyAssetFactory: Address };
};
type Acceptance = {
  chainId: number;
  paths: {
    verified: { outcome: string; holderAReceived: string; holderBReceived: string };
    challengedFalseApproval: { outcome: string; verifierStakeBeforeWei: string; verifierStakeAfterSlashWei: string };
  };
  transactions: Record<string, { hash: Hash; explorerUrl: string }>;
  secretsIncluded: boolean;
};
type Fresh = {
  chainId: number;
  site?: string;
  privateKeyIncluded: boolean;
  outcome: string;
  amountMinor: string;
  receivedMinor: string;
  transactions: Record<string, { hash: Hash; explorerUrl: string }>;
};
type MarketplaceAcceptance = {
  chainId: number;
  privateKeyIncluded: boolean;
  paidMinor: string;
  sharesReceived: string;
  inventoryBefore: string;
  inventoryAfter: string;
  transactions: Record<string, { hash: Hash; explorerUrl: string }>;
};

const manifest = JSON.parse(await readFile(resolve(root, "deployments/bot-testnet/manifest.json"), "utf8")) as Manifest;
const acceptance = JSON.parse(await readFile(resolve(root, "deployments/bot-testnet/acceptance.json"), "utf8")) as Acceptance;
const fresh = JSON.parse(await readFile(resolve(root, "deployments/bot-testnet/fresh-wallet-production.json"), "utf8")) as Fresh;
const marketplaceAcceptance = JSON.parse(await readFile(resolve(root, "deployments/bot-testnet/marketplace-acceptance.json"), "utf8")) as MarketplaceAcceptance;
const reportSite = site;
const checks: Array<{ requirement: string; ok: boolean; evidence: string }> = [];
const check = (requirement: string, ok: boolean, evidence: string) => checks.push({ requirement, ok, evidence });

const actualChainId = await client.getChainId();
check("BOT Testnet chain ID", actualChainId === 968 && manifest.chainId === 968 && acceptance.chainId === 968 && fresh.chainId === 968, `RPC=${actualChainId}; artifacts=968`);
const latestBlock = await client.getBlockNumber();
check("BOT Testnet RPC is live", latestBlock > 0n, `block ${latestBlock}`);

for (const [name, rawAddress] of Object.entries(manifest.contracts)) {
  const address = getAddress(rawAddress);
  const code = await client.getCode({ address });
  check(`Deployed bytecode: ${name}`, Boolean(code && code !== "0x"), address);
}

const transactionGroups = [
  ...Object.entries(acceptance.transactions).map(([name, value]) => [`acceptance:${name}`, value.hash] as const),
  ...Object.entries(fresh.transactions).map(([name, value]) => [`fresh-wallet:${name}`, value.hash] as const),
  ...Object.entries(marketplaceAcceptance.transactions).map(([name, value]) => [`marketplace:${name}`, value.hash] as const),
];
for (const [name, hash] of transactionGroups) {
  const receipt = await client.getTransactionReceipt({ hash });
  check(`Successful transaction: ${name}`, receipt.status === "success", `${hash} @ block ${receipt.blockNumber}`);
}

check(
  "Verified distribution conserves escrow",
  acceptance.paths.verified.outcome === "RELEASED"
    && Number(acceptance.paths.verified.holderAReceived) + Number(acceptance.paths.verified.holderBReceived) === 2000,
  `${acceptance.paths.verified.holderAReceived} + ${acceptance.paths.verified.holderBReceived} = 2000 USDT`,
);
check(
  "False approval is challenged, slashed, blocked, and refunded",
  acceptance.paths.challengedFalseApproval.outcome === "REFUNDED_AFTER_OVERTURN"
    && BigInt(acceptance.paths.challengedFalseApproval.verifierStakeBeforeWei)
      > BigInt(acceptance.paths.challengedFalseApproval.verifierStakeAfterSlashWei),
  `${acceptance.paths.challengedFalseApproval.verifierStakeBeforeWei} -> ${acceptance.paths.challengedFalseApproval.verifierStakeAfterSlashWei}`,
);
check(
  "Fresh public wallet completes exact payout",
  fresh.outcome === "SETTLED_AND_FULLY_CLAIMED" && fresh.amountMinor === fresh.receivedMinor,
  `${fresh.receivedMinor}/${fresh.amountMinor} minor units`,
);
check("Evidence artifacts contain no private key", !acceptance.secretsIncluded && !fresh.privateKeyIncluded, "secret flags are false");
check(
  "Fresh investor purchases live marketplace shares",
  marketplaceAcceptance.chainId === 968
    && !marketplaceAcceptance.privateKeyIncluded
    && BigInt(marketplaceAcceptance.paidMinor) === 25_000_000n
    && BigInt(marketplaceAcceptance.sharesReceived) === 10n ** 18n
    && BigInt(marketplaceAcceptance.inventoryBefore) - BigInt(marketplaceAcceptance.inventoryAfter) === 10n ** 18n,
  `${marketplaceAcceptance.paidMinor} minor units -> ${marketplaceAcceptance.sharesReceived} share units`,
);

const marketplaceAbi = [
  { type: "function", name: "listingCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "getListing", stateMutability: "view", inputs: [{ name: "listingId", type: "uint256" }], outputs: [{ name: "listing", type: "tuple", components: [{ name: "assetId", type: "bytes32" }, { name: "issuer", type: "address" }, { name: "shareToken", type: "address" }, { name: "pricePerShareMinor", type: "uint256" }, { name: "availableShares", type: "uint256" }, { name: "soldShares", type: "uint256" }, { name: "metadataURI", type: "string" }, { name: "active", type: "bool" }] }] },
] as const;
const roleAbi = [
  { type: "function", name: "ASSET_MANAGER_ROLE", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "hasRole", stateMutability: "view", inputs: [{ name: "role", type: "bytes32" }, { name: "account", type: "address" }], outputs: [{ type: "bool" }] },
] as const;
const tokenRoleAbi = [
  { type: "function", name: "MINTER_ROLE", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "DEFAULT_ADMIN_ROLE", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "hasRole", stateMutability: "view", inputs: [{ name: "role", type: "bytes32" }, { name: "account", type: "address" }], outputs: [{ type: "bool" }] },
] as const;
const [listingCount, listing, managerRole, minterRole, adminRole] = await Promise.all([
  client.readContract({ address: manifest.contracts.marketplace, abi: marketplaceAbi, functionName: "listingCount" }),
  client.readContract({ address: manifest.contracts.marketplace, abi: marketplaceAbi, functionName: "getListing", args: [1n] }),
  client.readContract({ address: manifest.contracts.assetRegistry, abi: roleAbi, functionName: "ASSET_MANAGER_ROLE" }),
  client.readContract({ address: manifest.contracts.revenueShareToken, abi: tokenRoleAbi, functionName: "MINTER_ROLE" }),
  client.readContract({ address: manifest.contracts.revenueShareToken, abi: tokenRoleAbi, functionName: "DEFAULT_ADMIN_ROLE" }),
]);
const [newFactoryAuthorized, legacyFactoryAuthorized, demoMinter, demoAdmin] = await Promise.all([
  client.readContract({ address: manifest.contracts.assetRegistry, abi: roleAbi, functionName: "hasRole", args: [managerRole, manifest.contracts.assetFactory] }),
  client.readContract({ address: manifest.contracts.assetRegistry, abi: roleAbi, functionName: "hasRole", args: [managerRole, manifest.marketplaceDeployment.legacyAssetFactory] }),
  client.readContract({ address: manifest.contracts.revenueShareToken, abi: tokenRoleAbi, functionName: "hasRole", args: [minterRole, manifest.deployer] }),
  client.readContract({ address: manifest.contracts.revenueShareToken, abi: tokenRoleAbi, functionName: "hasRole", args: [adminRole, manifest.deployer] }),
]);
check("Public offering remains live onchain", listingCount >= 1n && listing.active && listing.availableShares > 0n, `listings=${listingCount}; available=${listing.availableShares}`);
check("Only fixed-supply factory remains authorized", newFactoryAuthorized && !legacyFactoryAuthorized, `new=${newFactoryAuthorized}; legacy=${legacyFactoryAuthorized}`);
check("Seed share supply is permanently locked", !demoMinter && !demoAdmin, `minter=${demoMinter}; admin=${demoAdmin}`);

const landing = await fetch(site);
const landingHtml = await landing.text();
check("Public Veritable product is reachable", landing.status === 200 && landingHtml.includes("Veritable"), `${site} -> ${landing.status}`);
const marketplacePage = await fetch(`${site}/marketplace`);
const marketplaceHtml = await marketplacePage.text();
check(
  "Public marketplace UI is reachable",
  marketplacePage.status === 200 && marketplaceHtml.includes("Property offerings") && marketplaceHtml.includes("Your holdings"),
  `${site}/marketplace -> ${marketplacePage.status}`,
);
let reportResponse = await fetch(`${reportSite}/v1/reports/${canonicalClaim}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{}",
});
if (reportResponse.status === 405) reportResponse = await fetch(`${reportSite}/v1/reports/${canonicalClaim}`);
const publicReport = await reportResponse.json() as { report?: { outcome?: string; ruleResults?: unknown[] }; reportHash?: string };
check(
  "Public deterministic report is auditable",
  reportResponse.status === 200 && publicReport.report?.outcome === "VERIFIED" && publicReport.report.ruleResults?.length === 8,
  `status=${reportResponse.status}; outcome=${publicReport.report?.outcome}; rules=${publicReport.report?.ruleResults?.length ?? 0}`,
);
const missingAuthorization = await fetch(`${site}/v1/process/${canonicalClaim}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{}",
});
check("Hosted verifier rejects missing issuer authorization", missingAuthorization.status === 400, `HTTP ${missingAuthorization.status}`);

const result = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  scope: "BOT_TESTNET_PRODUCT_COMPLETION",
  product: "Veritable",
  site,
  chainId: 968,
  latestBlock: latestBlock.toString(),
  complete: checks.every((item) => item.ok),
  checksPassed: checks.filter((item) => item.ok).length,
  checksTotal: checks.length,
  checks,
  mainnetIncluded: false,
  privateValuesIncluded: false,
} as const;
await writeFile(resolve(root, "deployments/bot-testnet/completion-audit.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.complete) process.exitCode = 1;
