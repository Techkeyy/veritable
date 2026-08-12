import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import dotenv from "dotenv";
import { createPublicClient, defineChain, getAddress, http, isAddress, keccak256, type Address } from "viem";

dotenv.config({ path: resolve(process.cwd(), ".env"), quiet: true });

const REQUIRED_CONFIRMATION = "DEPLOY_VERITABLE_TO_BOT_MAINNET_677";
const BOT_MAINNET_USDT = getAddress("0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C");
const botMainnet = defineChain({
  id: 677,
  name: "BOT Chain",
  nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.botchain.ai"] } },
  blockExplorers: { default: { name: "BOTScan", url: "https://scan.botchain.ai" } },
});
const configuredUsdt = getAddress(process.env.BOT_MAINNET_USDT_ADDRESS ?? BOT_MAINNET_USDT);
const rpc = process.env.BOT_MAINNET_RPC_URL ?? botMainnet.rpcUrls.default.http[0];
const client = createPublicClient({ chain: botMainnet, transport: http(rpc) });
const checks: Array<{ name: string; ok: boolean; blocking: boolean; detail: string }> = [];
const check = (name: string, ok: boolean, blocking: boolean, detail: string) => checks.push({ name, ok, blocking, detail });

const chainId = await client.getChainId();
check("network:chain-id", chainId === 677, true, String(chainId));
const block = await client.getBlockNumber();
check("network:latest-block", block > 0n, true, block.toString());
check("token:configured-address", configuredUsdt === BOT_MAINNET_USDT, true, configuredUsdt);
const code = await client.getCode({ address: configuredUsdt });
check("token:deployed-code", Boolean(code && code !== "0x"), true, configuredUsdt);
const metadataAbi = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;
const [symbol, decimals] = await Promise.all([
  client.readContract({ address: configuredUsdt, abi: metadataAbi, functionName: "symbol" }),
  client.readContract({ address: configuredUsdt, abi: metadataAbi, functionName: "decimals" }),
]);
check("token:symbol", symbol === "USDT", true, symbol);
check("token:decimals", decimals === 6, true, String(decimals));

const artifactNames = ["AssetRegistry", "AssetFactory", "VerifierStaking", "YieldVault", "AttestationRegistry"];
const bytecodeHashes: Record<string, string> = {};
for (const name of artifactNames) {
  const path = resolve(process.cwd(), `packages/contracts/artifacts/contracts/${name}.sol/${name}.json`);
  try {
    const artifact = JSON.parse(await readFile(path, "utf8")) as { bytecode?: `0x${string}` };
    const bytecode = artifact.bytecode;
    const valid = Boolean(bytecode && bytecode !== "0x");
    check(`artifact:${name}`, valid, true, valid ? "compiled" : "empty bytecode");
    if (valid) bytecodeHashes[name] = keccak256(bytecode!);
  } catch {
    check(`artifact:${name}`, false, true, "missing; run pnpm --filter @veritable/contracts build");
  }
}

for (const file of [
  "deployments/bot-testnet/manifest.json",
  "deployments/bot-testnet/acceptance.json",
  "deployments/bot-testnet/fresh-wallet-production.json",
]) {
  try {
    await access(resolve(process.cwd(), file));
    check(`testnet:${file.split("/").at(-1)}`, true, true, file);
  } catch {
    check(`testnet:${file.split("/").at(-1)}`, false, true, `missing: ${file}`);
  }
}

const publicRoleNames = [
  "MAINNET_ADMIN_ADDRESS",
  "MAINNET_GUARDIAN_ADDRESS",
  "MAINNET_RESOLVER_ADDRESS",
  "MAINNET_VERIFIER_ADDRESS",
  "MAINNET_TREASURY_ADDRESS",
] as const;
const roleAddresses = publicRoleNames.map((name) => ({ name, value: process.env[name] }));
for (const role of roleAddresses) {
  check(`identity:${role.name}`, Boolean(role.value && isAddress(role.value)), true, role.value && isAddress(role.value) ? getAddress(role.value) : "not configured");
}
const configuredRoles = roleAddresses.flatMap((role) => role.value && isAddress(role.value) ? [getAddress(role.value as Address).toLowerCase()] : []);
check("identity:role-separation", configuredRoles.length === 5 && new Set(configuredRoles).size >= 4, true, `${new Set(configuredRoles).size}/5 distinct`);

for (const name of [
  "MAINNET_VERIFIER_BOND_BOT",
  "MAINNET_CHALLENGER_BOND_BOT",
  "MAINNET_CHALLENGE_WINDOW_SECONDS",
  "MAINNET_UNSTAKE_COOLDOWN_SECONDS",
  "MAINNET_BLOCKED_REFUND_DELAY_SECONDS",
]) {
  const value = process.env[name];
  check(`parameter:${name}`, Boolean(value && /^\d+(\.\d+)?$/.test(value) && Number(value) > 0), true, value ?? "not configured");
}

const authorized = process.env.ALLOW_MAINNET_DEPLOYMENT === REQUIRED_CONFIRMATION;
check("authorization:explicit-mainnet", authorized, true, authorized ? "present" : "not granted");
check("identity:dedicated-deployer-key", Boolean(process.env.MAINNET_DEPLOYER_PRIVATE_KEY), true, process.env.MAINNET_DEPLOYER_PRIVATE_KEY ? "configured (value redacted)" : "not configured");

const readiness = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: "READ_ONLY_NO_BROADCAST",
  network: "bot-mainnet",
  chainId: 677,
  rpc,
  explorer: "https://scan.botchain.ai",
  officialSettlementToken: configuredUsdt,
  latestBlock: block.toString(),
  bytecodeHashes,
  readyToDeploy: checks.every((item) => !item.blocking || item.ok),
  checks,
  privateValuesIncluded: false,
} as const;
const outDir = resolve(process.cwd(), "deployments/bot-mainnet");
await mkdir(outDir, { recursive: true });
await writeFile(resolve(outDir, "readiness.json"), `${JSON.stringify(readiness, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(readiness, null, 2)}\n`);
// Missing authorization/identities are expected before migration; only technical failures make this command fail.
const technicalFailure = checks.some((item) => item.blocking && !item.ok && !item.name.startsWith("authorization:") && !item.name.startsWith("identity:") && !item.name.startsWith("parameter:"));
if (technicalFailure) process.exitCode = 1;
