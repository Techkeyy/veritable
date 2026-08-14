import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { network } from "hardhat";
import { getAddress, parseUnits, type Address, type Hash } from "viem";

const EXPECTED_CHAIN_ID = 968;
const root = resolve(process.cwd(), "../..");
const manifestPath = resolve(root, "deployments/bot-testnet/manifest.json");

interface Manifest {
  chainId: number;
  demo: { assetId: Hash };
  contracts: {
    settlementToken: Address;
    assetRegistry: Address;
    assetFactory: Address;
    revenueShareToken: Address;
    marketplace?: Address;
  } & Record<string, Address>;
  transactions: Record<string, Hash>;
  marketplaceDeployment?: { deployedAt: string; blockNumber: string; legacyAssetFactory: Address };
}

async function upsertEnvironment(path: string, key: string, value: string) {
  let current = "";
  try { current = await readFile(path, "utf8"); } catch { /* Create a new environment file. */ }
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  const next = pattern.test(current)
    ? current.replace(pattern, line)
    : `${current.trimEnd()}${current.trim() ? "\n" : ""}${line}\n`;
  await writeFile(path, next, "utf8");
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
const legacyAssetFactory = getAddress(manifest.contracts.assetFactory);
const { viem, networkName } = await network.create();
if (networkName !== "botTestnet") throw new Error(`Marketplace deploy refused on network ${networkName}`);
const publicClient = await viem.getPublicClient();
const [deployer] = await viem.getWalletClients();
if (!deployer?.account) throw new Error("A Testnet deployer is required");
if (await publicClient.getChainId() !== EXPECTED_CHAIN_ID || manifest.chainId !== EXPECTED_CHAIN_ID) {
  throw new Error("Wrong-chain kill switch: BOT Testnet chain 968 is required");
}
if (manifest.contracts.marketplace) {
  const existingCode = await publicClient.getBytecode({ address: getAddress(manifest.contracts.marketplace) });
  if (existingCode && existingCode !== "0x") throw new Error(`Marketplace already deployed at ${manifest.contracts.marketplace}`);
}
const shareInventory = parseUnits("20", 18);
const shareToken = await viem.getContractAt("RevenueShareToken", getAddress(manifest.contracts.revenueShareToken), { client: { wallet: deployer } });
const balance = await shareToken.read.balanceOf([deployer.account.address]) as bigint;
if (balance < shareInventory) throw new Error("Issuer needs at least 20 demo share tokens to seed the public offering");

const marketplace = await viem.deployContract(
  "PrimaryOfferingMarketplace",
  [getAddress(manifest.contracts.assetRegistry), getAddress(manifest.contracts.settlementToken)],
  { client: { wallet: deployer } },
);
const replacementFactory = await viem.deployContract(
  "AssetFactory",
  [getAddress(manifest.contracts.assetRegistry), getAddress(manifest.contracts.yieldVault)],
  { client: { wallet: deployer } },
);
const assetRegistry = await viem.getContractAt("AssetRegistry", getAddress(manifest.contracts.assetRegistry), { client: { wallet: deployer } });
const assetManagerRole = await assetRegistry.read.ASSET_MANAGER_ROLE();
const grantFactoryHash = await assetRegistry.write.grantRole([assetManagerRole, replacementFactory.address]);
if ((await publicClient.waitForTransactionReceipt({ hash: grantFactoryHash })).status !== "success") throw new Error("Replacement factory role grant reverted");
const revokeOldFactoryHash = await assetRegistry.write.revokeRole([assetManagerRole, legacyAssetFactory]);
if ((await publicClient.waitForTransactionReceipt({ hash: revokeOldFactoryHash })).status !== "success") throw new Error("Legacy factory role revocation reverted");
const approvalHash = await shareToken.write.approve([marketplace.address, shareInventory]);
if ((await publicClient.waitForTransactionReceipt({ hash: approvalHash })).status !== "success") throw new Error("Marketplace share approval reverted");
const issuerMarketplace = await viem.getContractAt("PrimaryOfferingMarketplace", marketplace.address, { client: { wallet: deployer } });
const listingHash = await issuerMarketplace.write.createListing([
  manifest.demo.assetId,
  shareInventory,
  parseUnits("25", 6),
  "Solar-backed rental property · public BOT Testnet offering",
]);
if ((await publicClient.waitForTransactionReceipt({ hash: listingHash })).status !== "success") throw new Error("Seed listing reverted");
const minterRole = await shareToken.read.MINTER_ROLE();
const adminRole = await shareToken.read.DEFAULT_ADMIN_ROLE();
const renounceMinterHash = await shareToken.write.renounceRole([minterRole, deployer.account.address]);
if ((await publicClient.waitForTransactionReceipt({ hash: renounceMinterHash })).status !== "success") throw new Error("Demo-token minter lock reverted");
const renounceAdminHash = await shareToken.write.renounceRole([adminRole, deployer.account.address]);
if ((await publicClient.waitForTransactionReceipt({ hash: renounceAdminHash })).status !== "success") throw new Error("Demo-token admin lock reverted");

manifest.contracts.marketplace = marketplace.address;
manifest.contracts.assetFactory = replacementFactory.address;
manifest.transactions.grantReplacementFactoryRole = grantFactoryHash;
manifest.transactions.revokeLegacyFactoryRole = revokeOldFactoryHash;
manifest.transactions.marketplaceShareApproval = approvalHash;
manifest.transactions.seedMarketplaceListing = listingHash;
manifest.transactions.lockDemoShareMinter = renounceMinterHash;
manifest.transactions.lockDemoShareAdmin = renounceAdminHash;
manifest.marketplaceDeployment = {
  deployedAt: new Date().toISOString(),
  blockNumber: (await publicClient.getBlockNumber()).toString(),
  legacyAssetFactory,
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
await upsertEnvironment(resolve(root, "deployments/bot-testnet/web.env"), "NEXT_PUBLIC_MARKETPLACE_ADDRESS", marketplace.address);
await upsertEnvironment(resolve(root, "apps/web/.env.local"), "NEXT_PUBLIC_MARKETPLACE_ADDRESS", marketplace.address);
await upsertEnvironment(resolve(root, "deployments/bot-testnet/web.env"), "NEXT_PUBLIC_ASSET_FACTORY_ADDRESS", replacementFactory.address);
await upsertEnvironment(resolve(root, "apps/web/.env.local"), "NEXT_PUBLIC_ASSET_FACTORY_ADDRESS", replacementFactory.address);

console.log(JSON.stringify({
  chainId: EXPECTED_CHAIN_ID,
  marketplace: marketplace.address,
  fixedSupplyAssetFactory: replacementFactory.address,
  seededListingId: "1",
  seededShares: shareInventory.toString(),
  pricePerShareMinor: parseUnits("25", 6).toString(),
  transactions: { approval: approvalHash, listing: listingHash },
}, null, 2));
