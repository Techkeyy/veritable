import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { network } from "hardhat";
import { getAddress, isAddress, keccak256, parseEther, parseUnits, stringToHex, type Address, type Hash } from "viem";
import { hashCanonical } from "@veritable/policy";

const EXPECTED_CHAIN_ID = 968;
const VERIFIER_BOND = parseEther("10");
const CHALLENGER_BOND = parseEther("1");
const CHALLENGE_WINDOW = 15n * 60n;
const UNSTAKE_COOLDOWN = 60n * 60n;
const BLOCKED_REFUND_DELAY = 60n * 60n;
const DEMO_ASSET_ID = keccak256(stringToHex("asset:verifi-solar-001"));
const POLICY_HASH = keccak256(stringToHex("policy-v1"));
const TERMS_HASH = hashCanonical({
  expectedAmountMinor: "2000000000",
  dueDate: "2026-08-01",
  windowDays: 5,
  amountToleranceMinor: "0",
  payerReferenceHash: `0x${"33".repeat(32)}`,
});

function optionalAddress(name: string, fallback: Address): Address {
  const value = process.env[name];
  if (!value) return fallback;
  if (!isAddress(value)) throw new Error(`${name} must be a valid EVM address`);
  return getAddress(value);
}

const { viem, networkName } = await network.create();
if (networkName !== "botTestnet") throw new Error(`Testnet deploy refused on network ${networkName}`);
const publicClient = await viem.getPublicClient();
const [deployer, verifierWallet] = await viem.getWalletClients();
if (!deployer?.account || !verifierWallet?.account) {
  throw new Error("Separate deployer and verifier accounts are required");
}
const chainId = await publicClient.getChainId();
if (chainId !== EXPECTED_CHAIN_ID) {
  throw new Error(`Wrong-chain kill switch: expected ${EXPECTED_CHAIN_ID}, received ${chainId}`);
}

const admin = deployer.account.address;
const issuer = optionalAddress("ISSUER_ADDRESS", admin);
const holderA = optionalAddress("HOLDER_A_ADDRESS", admin);
const holderB = optionalAddress("HOLDER_B_ADDRESS", issuer);
const verifier = verifierWallet.account.address;
const treasury = optionalAddress("TREASURY_ADDRESS", admin);
const transactions: Record<string, Hash> = {};

const settlement = await viem.deployContract("MockUSDT", [], { client: { wallet: deployer } });
const assetRegistry = await viem.deployContract("AssetRegistry", [admin], { client: { wallet: deployer } });
const shareToken = await viem.deployContract("RevenueShareToken", ["VeriFi Solar One", "vSOLAR1", admin], { client: { wallet: deployer } });
const staking = await viem.deployContract("VerifierStaking", [admin, UNSTAKE_COOLDOWN], { client: { wallet: deployer } });
const vault = await viem.deployContract("YieldVault", [admin, settlement.address, assetRegistry.address, BLOCKED_REFUND_DELAY], { client: { wallet: deployer } });
const assetFactory = await viem.deployContract("AssetFactory", [assetRegistry.address, vault.address], { client: { wallet: deployer } });
const attestationRegistry = await viem.deployContract(
  "AttestationRegistry",
  [admin, vault.address, assetRegistry.address, staking.address, treasury, VERIFIER_BOND, CHALLENGER_BOND, CHALLENGE_WINDOW],
  { client: { wallet: deployer } },
);

transactions.grantSnapshotRole = await shareToken.write.grantRole([await shareToken.read.SNAPSHOT_ROLE(), vault.address]);
transactions.grantFactoryAssetManagerRole = await assetRegistry.write.grantRole([await assetRegistry.read.ASSET_MANAGER_ROLE(), assetFactory.address]);
transactions.grantVaultRegistryRole = await vault.write.grantRole([await vault.read.ATTESTATION_REGISTRY_ROLE(), attestationRegistry.address]);
transactions.grantStakingRegistryRole = await staking.write.grantRole([await staking.read.REGISTRY_ROLE(), attestationRegistry.address]);
transactions.grantVerifierRole = await attestationRegistry.write.grantRole([await attestationRegistry.read.VERIFIER_ROLE(), verifier]);
transactions.registerDemoAsset = await assetRegistry.write.registerAsset([DEMO_ASSET_ID, issuer, shareToken.address, POLICY_HASH, TERMS_HASH]);
transactions.mintHolderA = await shareToken.write.mint([holderA, 60n * 10n ** 18n]);
transactions.mintHolderB = await shareToken.write.mint([holderB, 40n * 10n ** 18n]);
transactions.mintIssuerTestUsdt = await settlement.write.mint([issuer, parseUnits("100000", 6)]);
const verifierStaking = await viem.getContractAt("VerifierStaking", staking.address, {
  client: { wallet: verifierWallet },
});
transactions.seedVerifierStake = await verifierStaking.write.stake([], { value: parseEther("25") });

for (const hash of Object.values(transactions)) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`Setup transaction reverted: ${hash}`);
}

const deploymentBlock = await publicClient.getBlockNumber();
const manifest = {
  schemaVersion: 1,
  network: "bot-testnet",
  chainId,
  rpcUrl: "https://rpc.bohr.life",
  deployedAt: new Date().toISOString(),
  deploymentBlock: deploymentBlock.toString(),
  deployer: admin,
  roles: { admin, issuer, verifier, treasury, holderA, holderB },
  parameters: {
    verifierBondWei: VERIFIER_BOND.toString(),
    challengerBondWei: CHALLENGER_BOND.toString(),
    challengeWindowSeconds: CHALLENGE_WINDOW.toString(),
    unstakeCooldownSeconds: UNSTAKE_COOLDOWN.toString(),
    blockedRefundDelaySeconds: BLOCKED_REFUND_DELAY.toString(),
  },
  contracts: {
    settlementToken: settlement.address,
    assetRegistry: assetRegistry.address,
    assetFactory: assetFactory.address,
    revenueShareToken: shareToken.address,
    verifierStaking: staking.address,
    yieldVault: vault.address,
    attestationRegistry: attestationRegistry.address,
  },
  demo: { assetId: DEMO_ASSET_ID, policyHash: POLICY_HASH, termsHash: TERMS_HASH },
  transactions,
} as const;

const outDir = resolve(process.cwd(), "../../deployments/bot-testnet");
await mkdir(outDir, { recursive: true });
await writeFile(resolve(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
const webEnvironment = [
  `NEXT_PUBLIC_BOT_TESTNET_RPC_URL=https://rpc.bohr.life`,
  `NEXT_PUBLIC_ASSET_REGISTRY_ADDRESS=${assetRegistry.address}`,
  `NEXT_PUBLIC_ASSET_FACTORY_ADDRESS=${assetFactory.address}`,
  `NEXT_PUBLIC_YIELD_VAULT_ADDRESS=${vault.address}`,
  `NEXT_PUBLIC_ATTESTATION_REGISTRY_ADDRESS=${attestationRegistry.address}`,
  `NEXT_PUBLIC_VERIFIER_STAKING_ADDRESS=${staking.address}`,
  `NEXT_PUBLIC_SETTLEMENT_TOKEN_ADDRESS=${settlement.address}`,
  "",
].join("\n");
await writeFile(
  resolve(outDir, "web.env"),
  webEnvironment,
  "utf8",
);
await writeFile(resolve(process.cwd(), "../../apps/web/.env.local"), webEnvironment, "utf8");
await writeFile(
  resolve(outDir, "agent.env"),
  [
    `CHAIN_ENV=bot-testnet`,
    `BOT_TESTNET_RPC_URL=https://rpc.bohr.life`,
    `YIELD_VAULT_ADDRESS=${vault.address}`,
    `ATTESTATION_REGISTRY_ADDRESS=${attestationRegistry.address}`,
    `YIELD_VAULT_DEPLOYMENT_BLOCK=${deploymentBlock}`,
    `AGENT_STATE_PATH=../../.verifi/agent-jobs.json`,
    "",
  ].join("\n"),
  "utf8",
);

console.log(JSON.stringify({ chainId, deploymentBlock: deploymentBlock.toString(), contracts: manifest.contracts }, null, 2));
