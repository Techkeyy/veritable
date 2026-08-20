// Read-only mainnet cost estimate. Calls eth_estimateGas against chain 677 with
// the real compiled bytecode and the exact constructor arguments the deployer
// will use. Broadcasts nothing and signs nothing.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import dotenv from "dotenv";
import { createPublicClient, encodeDeployData, formatEther, getAddress, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ROOT = process.cwd();
dotenv.config({ path: resolve(ROOT, ".env"), quiet: true });

const RPC = process.env.BOT_MAINNET_RPC_URL || "https://rpc.botchain.ai";
const client = createPublicClient({ transport: http(RPC) });
const deployer = privateKeyToAccount(process.env.MAINNET_DEPLOYER_PRIVATE_KEY).address;
const usdt = getAddress(process.env.BOT_MAINNET_USDT_ADDRESS);
const treasury = getAddress(process.env.MAINNET_TREASURY_ADDRESS);
const verifierBond = parseEther(process.env.MAINNET_VERIFIER_BOND_BOT);
const challengerBond = parseEther(process.env.MAINNET_CHALLENGER_BOND_BOT);
const challengeWindow = BigInt(process.env.MAINNET_CHALLENGE_WINDOW_SECONDS);
const unstakeCooldown = BigInt(process.env.MAINNET_UNSTAKE_COOLDOWN_SECONDS);
const blockedRefundDelay = BigInt(process.env.MAINNET_BLOCKED_REFUND_DELAY_SECONDS);

async function artifact(name) {
  const path = resolve(ROOT, `packages/contracts/artifacts/contracts/${name}.sol/${name}.json`);
  return JSON.parse(await readFile(path, "utf8"));
}

// Placeholder addresses for not-yet-deployed dependencies. Address size, not
// value, is what drives constructor gas.
const P = deployer;

const plan = [
  ["AssetRegistry", [deployer]],
  ["VerifierStaking", [deployer, unstakeCooldown]],
  ["YieldVault", [deployer, usdt, P, blockedRefundDelay]],
  ["AssetFactory", [P, P]],
  ["PrimaryOfferingMarketplace", [P, usdt]],
  ["AttestationRegistry", [deployer, P, P, P, treasury, verifierBond, challengerBond, challengeWindow]],
];

const gasPrice = await client.getGasPrice();
let deployGas = 0n;
const rows = [];

for (const [name, args] of plan) {
  const { abi, bytecode } = await artifact(name);
  const data = encodeDeployData({ abi, bytecode, args });
  let gas;
  try {
    gas = await client.estimateGas({ account: deployer, data });
  } catch (error) {
    gas = null;
    rows.push([name, "estimate failed: " + (error.shortMessage || error.message).slice(0, 60)]);
    continue;
  }
  deployGas += gas;
  rows.push([name, gas]);
}

// Wiring: 4 grants + 4 admin grants + 3 guardian/resolver grants + 4 revokes + 4 renounces.
// Measured on testnet at ~45k gas per role write; 19 writes on the mainnet path.
const ROLE_WRITES = 19n;
const PER_ROLE_WRITE = 50000n;
const wiringGas = ROLE_WRITES * PER_ROLE_WRITE;

const total = deployGas + wiringGas;
const cost = total * gasPrice;
const balance = await client.getBalance({ address: deployer });

process.stdout.write("\nPer-contract deployment gas (eth_estimateGas, chain 677):\n");
for (const [name, gas] of rows) {
  process.stdout.write(`  ${String(name).padEnd(28)} ${typeof gas === "bigint" ? gas.toString().padStart(10) : gas}\n`);
}
process.stdout.write(`\n  ${"deployment subtotal".padEnd(28)} ${deployGas.toString().padStart(10)}\n`);
process.stdout.write(`  ${`wiring (${ROLE_WRITES} role writes)`.padEnd(28)} ${wiringGas.toString().padStart(10)}\n`);
process.stdout.write(`  ${"TOTAL".padEnd(28)} ${total.toString().padStart(10)}\n`);
process.stdout.write(`\nGas price:       ${Number(gasPrice) / 1e9} gwei\n`);
process.stdout.write(`Estimated cost:  ${formatEther(cost)} BOT\n`);
process.stdout.write(`Deployer balance:${formatEther(balance)} BOT\n`);
process.stdout.write(`Remaining after: ${formatEther(balance - cost)} BOT\n`);
process.stdout.write(`Sufficient:      ${balance > cost * 2n ? "YES, with >2x headroom" : balance > cost ? "yes, but thin" : "NO"}\n`);
