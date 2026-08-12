import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { network } from "hardhat";
import { keccak256, parseUnits, stringToHex, zeroHash, type Address, type Hash } from "viem";

const EXPECTED_CHAIN_ID = 968;
const EXPLORER = "https://scan.bohr.life";
const PERIOD = "2026-08";
const AMOUNT = parseUnits("2000", 6);

interface Manifest {
  chainId: number;
  contracts: { settlementToken: Address; yieldVault: Address };
  demo: { assetId: Hash };
}

const { viem, networkName } = await network.create();
if (networkName !== "botTestnet") throw new Error(`Public demo seed refused on ${networkName}`);
const publicClient = await viem.getPublicClient();
const [deployer] = await viem.getWalletClients();
if (!deployer?.account) throw new Error("Deployer wallet is required");
const chainId = await publicClient.getChainId();
if (chainId !== EXPECTED_CHAIN_ID) throw new Error(`Wrong-chain kill switch: ${chainId}`);

const outDir = resolve(process.cwd(), "../../deployments/bot-testnet");
const manifest = JSON.parse(await readFile(resolve(outDir, "manifest.json"), "utf8")) as Manifest;
if (manifest.chainId !== chainId) throw new Error("Deployment manifest chain mismatch");

const settlement = await viem.getContractAt("MockUSDT", manifest.contracts.settlementToken, { client: { wallet: deployer } });
const vault = await viem.getContractAt("YieldVault", manifest.contracts.yieldVault, { client: { wallet: deployer } });
const periodKey = keccak256(stringToHex(PERIOD));
const evidenceRoot = keccak256(stringToHex("evidence:exact-payment"));
let claimId = await vault.read.periodClaims([manifest.demo.assetId, periodKey]) as Hash;
const transactions: Record<string, Hash> = {};

async function confirm(name: string, hash: Hash) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${name} reverted: ${hash}`);
  transactions[name] = hash;
  process.stdout.write(`${name}: ${EXPLORER}/tx/${hash}\n`);
}

if (claimId === zeroHash) {
  const balance = await settlement.read.balanceOf([deployer.account.address]) as bigint;
  if (balance < AMOUNT) await confirm("mint", await settlement.write.mint([deployer.account.address, AMOUNT - balance]));
  await confirm("approve", await settlement.write.approve([vault.address, AMOUNT]));
  await confirm("submitClaim", await vault.write.submitClaim([manifest.demo.assetId, periodKey, AMOUNT, evidenceRoot]));
  claimId = await vault.read.periodClaims([manifest.demo.assetId, periodKey]) as Hash;
}

const artifact = {
  schemaVersion: 1,
  network: "bot-testnet",
  chainId,
  period: PERIOD,
  amountMinor: AMOUNT.toString(),
  assetId: manifest.demo.assetId,
  claimId,
  evidenceRoot,
  transactions: Object.fromEntries(Object.entries(transactions).map(([name, hash]) => [name, { hash, explorerUrl: `${EXPLORER}/tx/${hash}` }])),
  secretsIncluded: false,
};
await mkdir(outDir, { recursive: true });
await writeFile(resolve(outDir, "public-demo.json"), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
process.stdout.write(`Public demo claim: ${claimId}\n`);
