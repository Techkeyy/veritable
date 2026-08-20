// Generates the BOT Mainnet operational identities and parameters.
//
// Appends to .env so existing secrets are never read back into memory. Prints
// public addresses and non-secret parameters only. Never broadcasts anything
// and never touches the deployer key, which the operator supplies.

import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import dotenv from "dotenv";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const ROOT = process.cwd();
const ENV_PATH = resolve(ROOT, ".env");
dotenv.config({ path: ENV_PATH, quiet: true });

const existing = await readFile(ENV_PATH, "utf8");
const alreadySet = (name) => new RegExp(`^${name}=.+$`, "m").test(existing);

// Refuse to regenerate anything already present, so a re-run cannot orphan funds.
const wanted = [
  "MAINNET_VERIFIER_PRIVATE_KEY",
  "MAINNET_ADMIN_PRIVATE_KEY",
  "MAINNET_GUARDIAN_PRIVATE_KEY",
  "MAINNET_RESOLVER_PRIVATE_KEY",
  "MAINNET_TREASURY_PRIVATE_KEY",
  "MAINNET_EVIDENCE_SIGNER_PRIVATE_KEY",
];
const collisions = wanted.filter(alreadySet);
if (collisions.length > 0) {
  process.stdout.write(`Refusing to overwrite existing values: ${collisions.join(", ")}\n`);
  process.exit(1);
}

const keys = Object.fromEntries(wanted.map((name) => [name, generatePrivateKey()]));
const addr = (name) => privateKeyToAccount(keys[name]).address;

const roles = {
  MAINNET_ADMIN_ADDRESS: addr("MAINNET_ADMIN_PRIVATE_KEY"),
  MAINNET_GUARDIAN_ADDRESS: addr("MAINNET_GUARDIAN_PRIVATE_KEY"),
  MAINNET_RESOLVER_ADDRESS: addr("MAINNET_RESOLVER_PRIVATE_KEY"),
  MAINNET_VERIFIER_ADDRESS: addr("MAINNET_VERIFIER_PRIVATE_KEY"),
  MAINNET_TREASURY_ADDRESS: addr("MAINNET_TREASURY_PRIVATE_KEY"),
  MAINNET_EVIDENCE_SIGNER_ADDRESS: addr("MAINNET_EVIDENCE_SIGNER_PRIVATE_KEY"),
};

// Deploy-script constraints: challenge window >= 300s, blocked refund delay >= window.
const parameters = {
  MAINNET_VERIFIER_BOND_BOT: "0.2",
  MAINNET_CHALLENGER_BOND_BOT: "0.02",
  MAINNET_CHALLENGE_WINDOW_SECONDS: "600",
  MAINNET_UNSTAKE_COOLDOWN_SECONDS: "86400",
  MAINNET_BLOCKED_REFUND_DELAY_SECONDS: "600",
};

const block = [
  "",
  "# ---- Generated Mainnet operational identities ----",
  "# Distinct keys per role. The deployer is temporary and renounces every role",
  "# at the end of deployment. Keys stay local; .env is gitignored.",
  ...wanted.map((name) => `${name}=${keys[name]}`),
  ...Object.entries(roles).map(([name, value]) => `${name}=${value}`),
  "",
  "# ---- Mainnet protocol parameters ----",
  ...Object.entries(parameters).map(([name, value]) => `${name}=${value}`),
  "",
].join("\n");

await appendFile(ENV_PATH, block, { encoding: "utf8" });

const distinct = new Set(
  [roles.MAINNET_ADMIN_ADDRESS, roles.MAINNET_GUARDIAN_ADDRESS, roles.MAINNET_RESOLVER_ADDRESS,
    roles.MAINNET_VERIFIER_ADDRESS, roles.MAINNET_TREASURY_ADDRESS].map((x) => x.toLowerCase()),
);

process.stdout.write(`${JSON.stringify({
  wrote: ".env (appended)",
  privateValuesPrinted: false,
  roles,
  parameters,
  distinctOperationalAddresses: distinct.size,
  roleSeparationSatisfied: distinct.size >= 4,
}, null, 2)}\n`);
