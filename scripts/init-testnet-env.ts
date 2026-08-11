import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import dotenv from "dotenv";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const projectRoot = resolve(import.meta.dirname, "..");
const examplePath = resolve(projectRoot, ".env.example");
const environmentPath = resolve(projectRoot, ".env");

const example = await readFile(examplePath, "utf8");
let existing = "";
try {
  existing = await readFile(environmentPath, "utf8");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const values = { ...dotenv.parse(example), ...dotenv.parse(existing) };
const generated: string[] = [];

function ensurePrivateKey(name: "DEPLOYER_PRIVATE_KEY" | "VERIFIER_PRIVATE_KEY" | "EVIDENCE_SIGNER_PRIVATE_KEY") {
  const current = values[name];
  if (current && /^0x[0-9a-fA-F]{64}$/.test(current)) return current as `0x${string}`;
  const key = generatePrivateKey();
  values[name] = key;
  generated.push(name);
  return key;
}

const deployerKey = ensurePrivateKey("DEPLOYER_PRIVATE_KEY");
const verifierKey = ensurePrivateKey("VERIFIER_PRIVATE_KEY");
const evidenceKey = ensurePrivateKey("EVIDENCE_SIGNER_PRIVATE_KEY");
values.EVIDENCE_SIGNER_ADDRESS = privateKeyToAccount(evidenceKey).address;

if (deployerKey.toLowerCase() === verifierKey.toLowerCase()) {
  throw new Error("Deployer and verifier keys must remain distinct");
}

const orderedKeys = [
  ...Object.keys(dotenv.parse(example)),
  ...Object.keys(values).filter((key) => !(key in dotenv.parse(example))),
];
const serialized = `${[...new Set(orderedKeys)].map((key) => `${key}=${values[key] ?? ""}`).join("\n")}\n`;
const temporaryPath = `${environmentPath}.tmp`;
await writeFile(temporaryPath, serialized, { encoding: "utf8", mode: 0o600 });
await rename(temporaryPath, environmentPath);

process.stdout.write(`${JSON.stringify({
  created: generated,
  addresses: {
    deployer: privateKeyToAccount(deployerKey).address,
    verifier: privateKeyToAccount(verifierKey).address,
    evidenceSigner: values.EVIDENCE_SIGNER_ADDRESS,
  },
  secretsPrinted: false,
}, null, 2)}\n`);
