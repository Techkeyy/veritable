import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import dotenv from "dotenv";
import { hashCanonical } from "../packages/policy/dist/index.js";
import { evidenceBundleSchema, paymentRecordSchema } from "../packages/schemas/dist/index.js";
import { isHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

dotenv.config({ path: resolve(process.cwd(), ".env"), quiet: true });

const inputPath = process.argv[2];
const outputPath = process.argv[3];
if (!inputPath || !outputPath) throw new Error("Usage: pnpm evidence:sign <unsigned-evidence.json> <signed-evidence.json>");
const privateKey = process.env.EVIDENCE_SIGNER_PRIVATE_KEY;
if (!privateKey || !isHex(privateKey) || privateKey.length !== 66) throw new Error("EVIDENCE_SIGNER_PRIVATE_KEY must be configured locally as a 32-byte hex key");

const raw = JSON.parse(await readFile(resolve(inputPath), "utf8")) as Record<string, unknown>;
const unsignedRecord = paymentRecordSchema.omit({ signatureValid: true, payloadHash: true }).parse(raw.paymentRecord);
const payloadHash = hashCanonical(unsignedRecord) as Hex;
const account = privateKeyToAccount(privateKey as Hex);
const signature = await account.signMessage({ message: { raw: payloadHash } });
const bundle = evidenceBundleSchema.parse({
  schemaVersion: "1.0",
  periodKey: raw.periodKey,
  assetTerms: raw.assetTerms,
  documents: raw.documents,
  modelRunHash: raw.modelRunHash,
  paymentEnvelope: { record: { ...unsignedRecord, payloadHash }, signer: account.address, signature },
});
await writeFile(resolve(outputPath), `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
process.stdout.write(`Signed evidence bundle written to ${resolve(outputPath)}\nEvidence root: ${hashCanonical(bundle)}\nSigner: ${account.address}\n`);
