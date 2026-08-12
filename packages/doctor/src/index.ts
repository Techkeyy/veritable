import { assertExpectedChain, environmentSchema, runtimeChainConfig } from "@veritable/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import dotenv from "dotenv";
import { createPublicClient, formatEther, getAddress, http, parseEther, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

dotenv.config({ path: resolve(process.cwd(), "../../.env"), quiet: true });

const erc20MetadataAbi = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;
const protocolAbi = [
  { type: "function", name: "settlementToken", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "assetRegistry", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "yieldVault", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "staking", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "VERIFIER_ROLE", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "freeStake", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "verifierBond", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "hasRole", stateMutability: "view", inputs: [{ type: "bytes32" }, { type: "address" }], outputs: [{ type: "bool" }] },
] as const;

interface DeploymentManifest {
  chainId: number;
  deployer?: Address;
  roles: {
    verifier: Address;
    admin?: Address;
    guardian?: Address;
    resolver?: Address;
  };
  contracts: Record<string, Address> & {
    settlementToken: Address;
    assetRegistry: Address;
    assetFactory: Address;
    verifierStaking: Address;
    yieldVault: Address;
    attestationRegistry: Address;
  };
}

const argument = process.argv.find((value) => value.startsWith("--network="))?.split("=")[1]
  ?? process.argv[process.argv.indexOf("--network") + 1]
  ?? process.env.CHAIN_ENV
  ?? "bot-testnet";
const environment = environmentSchema.parse(argument);
const requireDeployment = process.argv.includes("--require-deployment");
const requireWallets = process.argv.includes("--wallets");
const config = runtimeChainConfig(environment);
const client = createPublicClient({ chain: config.chain, transport: http(config.httpRpcUrl) });

const checks: Array<{ name: string; ok: boolean; detail: string }> = [];
try {
  const actualChainId = await client.getChainId();
  assertExpectedChain(actualChainId, config.chain.id);
  checks.push({ name: "chain-id", ok: true, detail: String(actualChainId) });
  const blockNumber = await client.getBlockNumber();
  checks.push({ name: "latest-block", ok: blockNumber > 0n, detail: String(blockNumber) });
  if (requireWallets) {
    const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
    const verifierKey = process.env.VERIFIER_PRIVATE_KEY;
    const evidenceKey = process.env.EVIDENCE_SIGNER_PRIVATE_KEY;
    const evidenceAddress = process.env.EVIDENCE_SIGNER_ADDRESS;
    const validKey = (value?: string): value is Hex => Boolean(value && /^0x[0-9a-fA-F]{64}$/.test(value));
    checks.push({ name: "wallet:deployer-key", ok: validKey(deployerKey), detail: validKey(deployerKey) ? "configured" : "missing or invalid" });
    checks.push({ name: "wallet:verifier-key", ok: validKey(verifierKey), detail: validKey(verifierKey) ? "configured" : "missing or invalid" });
    checks.push({ name: "wallet:evidence-key", ok: validKey(evidenceKey), detail: validKey(evidenceKey) ? "configured" : "missing or invalid" });
    if (validKey(deployerKey) && validKey(verifierKey)) {
      const deployer = privateKeyToAccount(deployerKey);
      const verifier = privateKeyToAccount(verifierKey);
      const deployerBalance = await client.getBalance({ address: deployer.address });
      const verifierBalance = await client.getBalance({ address: verifier.address });
      checks.push({ name: "wallet:separate-roles", ok: deployer.address.toLowerCase() !== verifier.address.toLowerCase(), detail: `${deployer.address} / ${verifier.address}` });
      checks.push({ name: "wallet:deployer-funded", ok: deployerBalance > 0n, detail: `${deployer.address} (${formatEther(deployerBalance)} tBOT)` });
      const verifierWalletMinimum = requireDeployment ? parseEther("0.05") : parseEther("6");
      const verifierFundingDetail = requireDeployment
        ? "requires at least 0.05 for post-deployment acceptance gas; bonded stake is checked on-chain"
        : "requires at least 6 for the 5 tBOT demo stake plus gas";
      checks.push({ name: "wallet:verifier-funded", ok: verifierBalance >= verifierWalletMinimum, detail: `${verifier.address} (${formatEther(verifierBalance)} tBOT; ${verifierFundingDetail})` });
    }
    if (validKey(evidenceKey)) {
      const derived = privateKeyToAccount(evidenceKey).address;
      const configuredEvidenceAddress = evidenceAddress && /^0x[0-9a-fA-F]{40}$/.test(evidenceAddress)
        ? getAddress(evidenceAddress)
        : undefined;
      checks.push({ name: "wallet:evidence-address", ok: configuredEvidenceAddress?.toLowerCase() === derived.toLowerCase(), detail: configuredEvidenceAddress ? `${configuredEvidenceAddress} matches derived signer: ${configuredEvidenceAddress.toLowerCase() === derived.toLowerCase()}` : "EVIDENCE_SIGNER_ADDRESS missing or invalid" });
    }
  }
  if (config.settlementToken) {
    const code = await client.getCode({ address: config.settlementToken as Address });
    const symbol = await client.readContract({ address: config.settlementToken, abi: erc20MetadataAbi, functionName: "symbol" });
    const decimals = await client.readContract({ address: config.settlementToken, abi: erc20MetadataAbi, functionName: "decimals" });
    checks.push({ name: "settlement-code", ok: Boolean(code && code !== "0x"), detail: config.settlementToken });
    checks.push({ name: "settlement-symbol", ok: symbol === "USDT", detail: symbol });
    checks.push({ name: "settlement-decimals", ok: decimals === 6, detail: String(decimals) });
  } else {
    checks.push({ name: "settlement-token", ok: true, detail: "not configured; deploy MockUSDT on testnet" });
  }

  const manifestArgument = process.argv.find((value) => value.startsWith("--manifest="))?.split("=")[1];
  const defaultManifest = resolve(process.cwd(), `../../deployments/${environment}/manifest.json`);
  const manifestPath = manifestArgument ? resolve(manifestArgument) : defaultManifest;
  let manifest: DeploymentManifest | undefined;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8")) as DeploymentManifest;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (!manifest) {
    checks.push({ name: "deployment-manifest", ok: !requireDeployment, detail: requireDeployment ? `missing: ${manifestPath}` : "not required for pre-deployment check" });
  } else {
    checks.push({ name: "manifest-chain-id", ok: manifest.chainId === config.chain.id, detail: String(manifest.chainId) });
    for (const [name, rawAddress] of Object.entries(manifest.contracts)) {
      const address = getAddress(rawAddress);
      const code = await client.getCode({ address });
      checks.push({ name: `code:${name}`, ok: Boolean(code && code !== "0x"), detail: address });
    }
    const vaultSettlement = await client.readContract({ address: manifest.contracts.yieldVault, abi: protocolAbi, functionName: "settlementToken" });
    const vaultAssetRegistry = await client.readContract({ address: manifest.contracts.yieldVault, abi: protocolAbi, functionName: "assetRegistry" });
    const registryVault = await client.readContract({ address: manifest.contracts.attestationRegistry, abi: protocolAbi, functionName: "yieldVault" });
    const registryAssetRegistry = await client.readContract({ address: manifest.contracts.attestationRegistry, abi: protocolAbi, functionName: "assetRegistry" });
    const registryStaking = await client.readContract({ address: manifest.contracts.attestationRegistry, abi: protocolAbi, functionName: "staking" });
    checks.push({ name: "wire:vault-settlement", ok: vaultSettlement.toLowerCase() === manifest.contracts.settlementToken.toLowerCase(), detail: vaultSettlement });
    checks.push({ name: "wire:vault-assets", ok: vaultAssetRegistry.toLowerCase() === manifest.contracts.assetRegistry.toLowerCase(), detail: vaultAssetRegistry });
    checks.push({ name: "wire:registry-vault", ok: registryVault.toLowerCase() === manifest.contracts.yieldVault.toLowerCase(), detail: registryVault });
    checks.push({ name: "wire:registry-assets", ok: registryAssetRegistry.toLowerCase() === manifest.contracts.assetRegistry.toLowerCase(), detail: registryAssetRegistry });
    checks.push({ name: "wire:registry-staking", ok: registryStaking.toLowerCase() === manifest.contracts.verifierStaking.toLowerCase(), detail: registryStaking });
    const verifierRole = await client.readContract({ address: manifest.contracts.attestationRegistry, abi: protocolAbi, functionName: "VERIFIER_ROLE" });
    const verifierAuthorized = await client.readContract({ address: manifest.contracts.attestationRegistry, abi: protocolAbi, functionName: "hasRole", args: [verifierRole, manifest.roles.verifier] });
    const freeStake = await client.readContract({ address: manifest.contracts.verifierStaking, abi: protocolAbi, functionName: "freeStake", args: [manifest.roles.verifier] });
    const verifierBond = await client.readContract({ address: manifest.contracts.attestationRegistry, abi: protocolAbi, functionName: "verifierBond" });
    checks.push({ name: "role:verifier", ok: verifierAuthorized, detail: manifest.roles.verifier });
    checks.push({ name: "stake:available-bond", ok: freeStake >= verifierBond, detail: `${freeStake}/${verifierBond}` });
    if (environment === "bot-mainnet") {
      if (!manifest.roles.admin || !manifest.roles.guardian || !manifest.roles.resolver || !manifest.deployer) {
        checks.push({ name: "role:mainnet-manifest", ok: false, detail: "admin, guardian, resolver, and deployer are required" });
      } else {
        const roleAbi = [
          { type: "function", name: "DEFAULT_ADMIN_ROLE", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
          { type: "function", name: "GUARDIAN_ROLE", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
          { type: "function", name: "RESOLVER_ROLE", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
          { type: "function", name: "ASSET_MANAGER_ROLE", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
          { type: "function", name: "hasRole", stateMutability: "view", inputs: [{ type: "bytes32" }, { type: "address" }], outputs: [{ type: "bool" }] },
        ] as const;
        const defaultAdminRole = await client.readContract({ address: manifest.contracts.assetRegistry, abi: roleAbi, functionName: "DEFAULT_ADMIN_ROLE" });
        const assetManagerRole = await client.readContract({ address: manifest.contracts.assetRegistry, abi: roleAbi, functionName: "ASSET_MANAGER_ROLE" });
        const vaultGuardianRole = await client.readContract({ address: manifest.contracts.yieldVault, abi: roleAbi, functionName: "GUARDIAN_ROLE" });
        const registryGuardianRole = await client.readContract({ address: manifest.contracts.attestationRegistry, abi: roleAbi, functionName: "GUARDIAN_ROLE" });
        const resolverRole = await client.readContract({ address: manifest.contracts.attestationRegistry, abi: roleAbi, functionName: "RESOLVER_ROLE" });
        const managedContracts = [manifest.contracts.assetRegistry, manifest.contracts.verifierStaking, manifest.contracts.yieldVault, manifest.contracts.attestationRegistry];
        for (const [index, address] of managedContracts.entries()) {
          const adminAuthorized = await client.readContract({ address, abi: roleAbi, functionName: "hasRole", args: [defaultAdminRole, manifest.roles.admin] });
          const deployerStillAdmin = await client.readContract({ address, abi: roleAbi, functionName: "hasRole", args: [defaultAdminRole, manifest.deployer] });
          checks.push({ name: `role:admin:${index}`, ok: adminAuthorized, detail: `${address} -> ${manifest.roles.admin}` });
          checks.push({ name: `role:deployer-admin-revoked:${index}`, ok: !deployerStillAdmin, detail: `${address} -> ${manifest.deployer}` });
        }
        const vaultGuardian = await client.readContract({ address: manifest.contracts.yieldVault, abi: roleAbi, functionName: "hasRole", args: [vaultGuardianRole, manifest.roles.guardian] });
        const registryGuardian = await client.readContract({ address: manifest.contracts.attestationRegistry, abi: roleAbi, functionName: "hasRole", args: [registryGuardianRole, manifest.roles.guardian] });
        const resolverAuthorized = await client.readContract({ address: manifest.contracts.attestationRegistry, abi: roleAbi, functionName: "hasRole", args: [resolverRole, manifest.roles.resolver] });
        const deployerAssetManager = await client.readContract({ address: manifest.contracts.assetRegistry, abi: roleAbi, functionName: "hasRole", args: [assetManagerRole, manifest.deployer] });
        checks.push({ name: "role:vault-guardian", ok: vaultGuardian, detail: manifest.roles.guardian });
        checks.push({ name: "role:registry-guardian", ok: registryGuardian, detail: manifest.roles.guardian });
        checks.push({ name: "role:resolver", ok: resolverAuthorized, detail: manifest.roles.resolver });
        checks.push({ name: "role:deployer-asset-manager-revoked", ok: !deployerAssetManager, detail: manifest.deployer });
      }
    }
  }
} catch (error) {
  checks.push({ name: "rpc", ok: false, detail: error instanceof Error ? error.message : "Unknown error" });
}

process.stdout.write(`${JSON.stringify({ environment, chainId: config.chain.id, rpc: config.httpRpcUrl, checks }, null, 2)}\n`);
if (checks.some((check) => !check.ok)) process.exitCode = 1;
