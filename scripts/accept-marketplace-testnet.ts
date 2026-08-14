import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import dotenv from "dotenv";
import { createPublicClient, createWalletClient, defineChain, http, parseEther, parseUnits, type Address, type Hash } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

dotenv.config({ path: resolve(process.cwd(), ".env"), quiet: true });
const chain = defineChain({
  id: 968,
  name: "BOT Chain Testnet",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [process.env.BOT_TESTNET_RPC_URL || "https://rpc.bohr.life"] } },
  blockExplorers: { default: { name: "BOTScan Testnet", url: "https://scan.bohr.life" } },
  testnet: true,
});
const rpc = process.env.BOT_TESTNET_RPC_URL || "https://rpc.bohr.life";
const explorer = "https://scan.bohr.life";
const tokenAbi = [
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;
const marketplaceAbi = [
  { type: "function", name: "buy", stateMutability: "nonpayable", inputs: [{ name: "listingId", type: "uint256" }, { name: "shareAmount", type: "uint256" }, { name: "maxCostMinor", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "getListing", stateMutability: "view", inputs: [{ name: "listingId", type: "uint256" }], outputs: [{ name: "listing", type: "tuple", components: [{ name: "assetId", type: "bytes32" }, { name: "issuer", type: "address" }, { name: "shareToken", type: "address" }, { name: "pricePerShareMinor", type: "uint256" }, { name: "availableShares", type: "uint256" }, { name: "soldShares", type: "uint256" }, { name: "metadataURI", type: "string" }, { name: "active", type: "bool" }] }] },
] as const;

const manifest = JSON.parse(await readFile(resolve(process.cwd(), "deployments/bot-testnet/manifest.json"), "utf8")) as {
  chainId: number;
  contracts: { settlementToken: Address; marketplace: Address };
};
if (manifest.chainId !== chain.id) throw new Error("Wrong-chain marketplace manifest");
const deployerKey = process.env.DEPLOYER_PRIVATE_KEY as Hash | undefined;
if (!deployerKey) throw new Error("Dedicated Testnet deployer key is required");
const funder = privateKeyToAccount(deployerKey);
const investor = privateKeyToAccount(generatePrivateKey());
const publicClient = createPublicClient({ chain, transport: http(rpc) });
const funderClient = createWalletClient({ chain, transport: http(rpc), account: funder });
const investorClient = createWalletClient({ chain, transport: http(rpc), account: investor });
const transactions: Record<string, { hash: Hash; explorerUrl: string }> = {};

async function confirm(name: string, hash: Hash) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${name} reverted`);
  transactions[name] = { hash, explorerUrl: `${explorer}/tx/${hash}` };
}

const listingBefore = await publicClient.readContract({ address: manifest.contracts.marketplace, abi: marketplaceAbi, functionName: "getListing", args: [1n] });
const shareAmount = parseUnits("1", 18);
const cost = listingBefore.pricePerShareMinor;
if (!listingBefore.active || listingBefore.availableShares < shareAmount) throw new Error("Seed marketplace listing has no inventory");
await confirm("fundInvestorGas", await funderClient.sendTransaction({ to: investor.address, value: parseEther("0.03") }));
await confirm("mintInvestorTestUsdt", await investorClient.writeContract({ address: manifest.contracts.settlementToken, abi: tokenAbi, functionName: "mint", args: [investor.address, parseUnits("100", 6)] }));
await confirm("approveMarketplace", await investorClient.writeContract({ address: manifest.contracts.settlementToken, abi: tokenAbi, functionName: "approve", args: [manifest.contracts.marketplace, cost] }));
await confirm("purchaseShares", await investorClient.writeContract({ address: manifest.contracts.marketplace, abi: marketplaceAbi, functionName: "buy", args: [1n, shareAmount, cost] }));
const [listingAfter, investorShares] = await Promise.all([
  publicClient.readContract({ address: manifest.contracts.marketplace, abi: marketplaceAbi, functionName: "getListing", args: [1n] }),
  publicClient.readContract({ address: listingBefore.shareToken, abi: tokenAbi, functionName: "balanceOf", args: [investor.address] }),
]);
if (investorShares !== shareAmount || listingBefore.availableShares - listingAfter.availableShares !== shareAmount) {
  throw new Error("Live marketplace purchase did not conserve share inventory");
}
const artifact = {
  schemaVersion: 1,
  network: "bot-testnet",
  chainId: chain.id,
  investor: investor.address,
  privateKeyIncluded: false,
  listingId: "1",
  paidMinor: cost.toString(),
  sharesReceived: investorShares.toString(),
  inventoryBefore: listingBefore.availableShares.toString(),
  inventoryAfter: listingAfter.availableShares.toString(),
  transactions,
};
await writeFile(resolve(process.cwd(), "deployments/bot-testnet/marketplace-acceptance.json"), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
