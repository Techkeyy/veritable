import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import dotenv from "dotenv";
import { privateKeyToAccount } from "viem/accounts";

dotenv.config({ path: resolve(process.cwd(), "../../.env"), quiet: true });

const baseUrl = process.env.HOSTED_TEST_BASE_URL ?? "http://127.0.0.1:3100";
const artifact = JSON.parse(await readFile(resolve(process.cwd(), "../../deployments/bot-testnet/public-demo.json"), "utf8"));
const claimId = artifact.claimId;
const message = [
  "VeriFi BOT Testnet attestation request",
  `Claim: ${claimId}`,
  "Chain: 968",
  "Purpose: authorize the bonded verifier to inspect this claim's committed sandbox evidence.",
].join("\n");

const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
const verifierKey = process.env.VERIFIER_PRIVATE_KEY;
if (!deployerKey || !verifierKey) throw new Error("Dedicated BOT Testnet identities are required");

const noAuthorization = await fetch(`${baseUrl}/v1/process/${claimId}`, { method: "POST" });
if (noAuthorization.status !== 400) throw new Error(`Missing authorization returned ${noAuthorization.status}`);

const nonIssuer = privateKeyToAccount(verifierKey);
const nonIssuerSignature = await nonIssuer.signMessage({ message });
const forbidden = await fetch(`${baseUrl}/v1/process/${claimId}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ requester: nonIssuer.address, signature: nonIssuerSignature }),
});
if (forbidden.status !== 403) throw new Error(`Non-issuer authorization returned ${forbidden.status}`);

const issuer = privateKeyToAccount(deployerKey);
const issuerSignature = await issuer.signMessage({ message });
const authorized = await fetch(`${baseUrl}/v1/process/${claimId}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ requester: issuer.address, signature: issuerSignature }),
});
const result = await authorized.json();
if (authorized.status !== 200 || result.status !== "ALREADY_SUBMITTED") {
  throw new Error(`Issuer authorization failed with ${authorized.status}/${result.status ?? "unknown"}`);
}

process.stdout.write("Hosted authorization smoke passed: missing=400, non-issuer=403, issuer=idempotent\n");
