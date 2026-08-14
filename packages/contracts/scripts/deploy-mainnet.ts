import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { network } from "hardhat";
import {
  formatEther,
  getAddress,
  isAddress,
  parseEther,
  type Address,
  type Hash,
} from "viem";

const EXPECTED_CHAIN_ID = 677;
const REQUIRED_CONFIRMATION = "DEPLOY_VERITABLE_TO_BOT_MAINNET_677";
const EXPLORER = "https://scan.botchain.ai";
const BOT_MAINNET_USDT = getAddress("0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C");

function requiredAddress(name: string): Address {
  const value = process.env[name];
  if (!value || !isAddress(value)) throw new Error(`${name} must be a valid EVM address`);
  return getAddress(value);
}

function requiredPositiveInteger(name: string): bigint {
  const value = process.env[name];
  if (!value || !/^\d+$/.test(value) || BigInt(value) === 0n) {
    throw new Error(`${name} must be a positive integer`);
  }
  return BigInt(value);
}

function requiredBotAmount(name: string): bigint {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  const parsed = parseEther(value);
  if (parsed === 0n) throw new Error(`${name} must be greater than zero`);
  return parsed;
}

if (process.env.ALLOW_MAINNET_DEPLOYMENT !== REQUIRED_CONFIRMATION) {
  throw new Error(
    `Mainnet deployment locked. Set ALLOW_MAINNET_DEPLOYMENT=${REQUIRED_CONFIRMATION} only after explicit authorization and a green preflight.`,
  );
}

const configuredUsdt = requiredAddress("BOT_MAINNET_USDT_ADDRESS");
if (configuredUsdt !== BOT_MAINNET_USDT) {
  throw new Error(`Official-USDT kill switch: expected ${BOT_MAINNET_USDT}, received ${configuredUsdt}`);
}

const admin = requiredAddress("MAINNET_ADMIN_ADDRESS");
const guardian = requiredAddress("MAINNET_GUARDIAN_ADDRESS");
const resolver = requiredAddress("MAINNET_RESOLVER_ADDRESS");
const verifier = requiredAddress("MAINNET_VERIFIER_ADDRESS");
const treasury = requiredAddress("MAINNET_TREASURY_ADDRESS");
const verifierBond = requiredBotAmount("MAINNET_VERIFIER_BOND_BOT");
const challengerBond = requiredBotAmount("MAINNET_CHALLENGER_BOND_BOT");
const challengeWindow = requiredPositiveInteger("MAINNET_CHALLENGE_WINDOW_SECONDS");
const unstakeCooldown = requiredPositiveInteger("MAINNET_UNSTAKE_COOLDOWN_SECONDS");
const blockedRefundDelay = requiredPositiveInteger("MAINNET_BLOCKED_REFUND_DELAY_SECONDS");

if (challengeWindow < 300n) throw new Error("Mainnet challenge window must be at least 300 seconds");
if (blockedRefundDelay < challengeWindow) {
  throw new Error("Mainnet blocked-refund delay must be at least the challenge window");
}

const { viem, networkName } = await network.create();
if (networkName !== "botMainnet") throw new Error(`Mainnet deploy refused on network ${networkName}`);
const publicClient = await viem.getPublicClient();
const [deployer] = await viem.getWalletClients();
if (!deployer?.account) throw new Error("A dedicated Mainnet deployer is required");
const chainId = await publicClient.getChainId();
if (chainId !== EXPECTED_CHAIN_ID) {
  throw new Error(`Wrong-chain kill switch: expected ${EXPECTED_CHAIN_ID}, received ${chainId}`);
}
if (deployer.account.address === admin) {
  throw new Error("MAINNET_ADMIN_ADDRESS must differ from the temporary deployer");
}
const uniqueOperationalRoles = new Set([admin, guardian, resolver, verifier, treasury].map((x) => x.toLowerCase()));
if (uniqueOperationalRoles.size < 4) {
  throw new Error("Mainnet role separation requires at least four distinct operational addresses");
}

const usdtCode = await publicClient.getCode({ address: configuredUsdt });
if (!usdtCode || usdtCode === "0x") throw new Error("Official Mainnet USDT has no deployed bytecode");
const metadataAbi = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;
const [symbol, decimals] = await Promise.all([
  publicClient.readContract({ address: configuredUsdt, abi: metadataAbi, functionName: "symbol" }),
  publicClient.readContract({ address: configuredUsdt, abi: metadataAbi, functionName: "decimals" }),
]);
if (symbol !== "USDT" || decimals !== 6) {
  throw new Error(`Official-USDT metadata gate failed: ${symbol}/${decimals}`);
}
const balance = await publicClient.getBalance({ address: deployer.account.address });
if (balance === 0n) throw new Error("Dedicated Mainnet deployer has no BOT for gas");

const transactions: Record<string, Hash> = {};
async function confirm(name: string, hash: Hash): Promise<void> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${name} reverted: ${hash}`);
  transactions[name] = hash;
  process.stdout.write(`${name}: ${EXPLORER}/tx/${hash}\n`);
}

const temporaryAdmin = deployer.account.address;
const assetRegistry = await viem.deployContract("AssetRegistry", [temporaryAdmin], { client: { wallet: deployer } });
const staking = await viem.deployContract("VerifierStaking", [temporaryAdmin, unstakeCooldown], { client: { wallet: deployer } });
const vault = await viem.deployContract(
  "YieldVault",
  [temporaryAdmin, configuredUsdt, assetRegistry.address, blockedRefundDelay],
  { client: { wallet: deployer } },
);
const assetFactory = await viem.deployContract("AssetFactory", [assetRegistry.address, vault.address], { client: { wallet: deployer } });
const marketplace = await viem.deployContract("PrimaryOfferingMarketplace", [assetRegistry.address, configuredUsdt], { client: { wallet: deployer } });
const attestationRegistry = await viem.deployContract(
  "AttestationRegistry",
  [temporaryAdmin, vault.address, assetRegistry.address, staking.address, treasury, verifierBond, challengerBond, challengeWindow],
  { client: { wallet: deployer } },
);

await confirm("grantFactoryAssetManagerRole", await assetRegistry.write.grantRole([await assetRegistry.read.ASSET_MANAGER_ROLE(), assetFactory.address]));
await confirm("grantVaultRegistryRole", await vault.write.grantRole([await vault.read.ATTESTATION_REGISTRY_ROLE(), attestationRegistry.address]));
await confirm("grantStakingRegistryRole", await staking.write.grantRole([await staking.read.REGISTRY_ROLE(), attestationRegistry.address]));
await confirm("grantVerifierRole", await attestationRegistry.write.grantRole([await attestationRegistry.read.VERIFIER_ROLE(), verifier]));

const contracts = [assetRegistry, staking, vault, attestationRegistry] as const;
for (const [index, contract] of contracts.entries()) {
  await confirm(`grantAdmin:${index}`, await contract.write.grantRole([await contract.read.DEFAULT_ADMIN_ROLE(), admin]));
}
await confirm("grantVaultGuardian", await vault.write.grantRole([await vault.read.GUARDIAN_ROLE(), guardian]));
await confirm("grantRegistryGuardian", await attestationRegistry.write.grantRole([await attestationRegistry.read.GUARDIAN_ROLE(), guardian]));
await confirm("grantResolver", await attestationRegistry.write.grantRole([await attestationRegistry.read.RESOLVER_ROLE(), resolver]));

await confirm("revokeDeployerAssetManager", await assetRegistry.write.revokeRole([await assetRegistry.read.ASSET_MANAGER_ROLE(), temporaryAdmin]));
await confirm("revokeDeployerVaultGuardian", await vault.write.revokeRole([await vault.read.GUARDIAN_ROLE(), temporaryAdmin]));
await confirm("revokeDeployerRegistryGuardian", await attestationRegistry.write.revokeRole([await attestationRegistry.read.GUARDIAN_ROLE(), temporaryAdmin]));
await confirm("revokeDeployerResolver", await attestationRegistry.write.revokeRole([await attestationRegistry.read.RESOLVER_ROLE(), temporaryAdmin]));
for (const [index, contract] of contracts.entries()) {
  await confirm(`renounceDeployerAdmin:${index}`, await contract.write.renounceRole([await contract.read.DEFAULT_ADMIN_ROLE(), temporaryAdmin]));
}

const deploymentBlock = await publicClient.getBlockNumber();
const manifest = {
  schemaVersion: 1,
  network: "bot-mainnet",
  chainId,
  rpcUrl: "https://rpc.botchain.ai",
  explorer: EXPLORER,
  deployedAt: new Date().toISOString(),
  deploymentBlock: deploymentBlock.toString(),
  sourceCommit: process.env.SOURCE_COMMIT ?? "UNSET",
  deployer: temporaryAdmin,
  deployerBalanceBeforeWei: balance.toString(),
  roles: { admin, guardian, resolver, verifier, treasury },
  parameters: {
    verifierBondWei: verifierBond.toString(),
    challengerBondWei: challengerBond.toString(),
    challengeWindowSeconds: challengeWindow.toString(),
    unstakeCooldownSeconds: unstakeCooldown.toString(),
    blockedRefundDelaySeconds: blockedRefundDelay.toString(),
  },
  contracts: {
    settlementToken: configuredUsdt,
    assetRegistry: assetRegistry.address,
    assetFactory: assetFactory.address,
    marketplace: marketplace.address,
    verifierStaking: staking.address,
    yieldVault: vault.address,
    attestationRegistry: attestationRegistry.address,
  },
  transactions,
  notes: [
    "No MockUSDT or seeded demo asset was deployed.",
    "Temporary deployer operational and admin roles were removed after setup.",
    `Deployer balance before deployment: ${formatEther(balance)} BOT.`,
  ],
} as const;

const outDir = resolve(process.cwd(), "../../deployments/bot-mainnet");
await mkdir(outDir, { recursive: true });
await writeFile(resolve(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
await writeFile(
  resolve(outDir, "web.env"),
  [
    "NEXT_PUBLIC_CHAIN_ENV=bot-mainnet",
    "NEXT_PUBLIC_BOT_MAINNET_RPC_URL=https://rpc.botchain.ai",
    "NEXT_PUBLIC_ALLOW_MAINNET_WRITES=",
    `NEXT_PUBLIC_CHALLENGER_BOND_BOT=${formatEther(challengerBond)}`,
    `NEXT_PUBLIC_CHALLENGE_WINDOW_SECONDS=${challengeWindow}`,
    `NEXT_PUBLIC_ASSET_REGISTRY_ADDRESS=${assetRegistry.address}`,
    `NEXT_PUBLIC_ASSET_FACTORY_ADDRESS=${assetFactory.address}`,
    `NEXT_PUBLIC_MARKETPLACE_ADDRESS=${marketplace.address}`,
    `NEXT_PUBLIC_YIELD_VAULT_ADDRESS=${vault.address}`,
    `NEXT_PUBLIC_ATTESTATION_REGISTRY_ADDRESS=${attestationRegistry.address}`,
    `NEXT_PUBLIC_VERIFIER_STAKING_ADDRESS=${staking.address}`,
    `NEXT_PUBLIC_SETTLEMENT_TOKEN_ADDRESS=${configuredUsdt}`,
    "",
  ].join("\n"),
  "utf8",
);
await writeFile(
  resolve(outDir, "agent.env"),
  [
    "CHAIN_ENV=bot-mainnet",
    "BOT_MAINNET_RPC_URL=https://rpc.botchain.ai",
    `YIELD_VAULT_ADDRESS=${vault.address}`,
    `ATTESTATION_REGISTRY_ADDRESS=${attestationRegistry.address}`,
    `YIELD_VAULT_DEPLOYMENT_BLOCK=${deploymentBlock}`,
    "AGENT_STATE_PATH=../../.verifi/mainnet-agent-jobs.json",
    "AGENT_RETRY_INTERVAL_MS=5000",
    "ALLOW_MAINNET=false",
    "",
  ].join("\n"),
  "utf8",
);
process.stdout.write(`${JSON.stringify({ chainId, deploymentBlock: deploymentBlock.toString(), contracts: manifest.contracts }, null, 2)}\n`);
