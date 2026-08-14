import { createServer, type IncomingMessage } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import dotenv from "dotenv";
import { evidenceBundleSchema } from "@veritable/schemas";
import { hashCanonical } from "@veritable/policy";
import { getAddress, verifyMessage, type Address, type Hex } from "viem";
import { readPublicReport } from "./publicReports.js";

dotenv.config({ path: resolve(process.cwd(), "../../.env"), quiet: true });

const port = Number(process.env.PORT ?? 4100);
const reportStorePath = process.env.AGENT_STATE_PATH ?? "../../.verifi/agent-jobs.json";
const evidenceStorePath = resolve(process.cwd(), process.env.EVIDENCE_STORE_PATH ?? "../../.verifi/evidence-bundles.json");
const ingestToken = process.env.EVIDENCE_INGEST_TOKEN;
const trustedSigner = process.env.EVIDENCE_SIGNER_ADDRESS ? getAddress(process.env.EVIDENCE_SIGNER_ADDRESS) : undefined;
const allowedOrigins = new Set((process.env.WEB_ALLOWED_ORIGINS ?? "http://localhost:3000,http://127.0.0.1:3000").split(",").map((origin) => origin.trim()).filter(Boolean));

function json(response: import("node:http").ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

async function requestJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 2_000_000) throw new Error("Evidence bundle exceeds the 2 MB limit");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function readEvidenceStore(): Promise<Record<string, unknown>> {
  try { return JSON.parse(await readFile(evidenceStorePath, "utf8")) as Record<string, unknown>; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}; throw error; }
}

async function validateBundle(raw: unknown) {
  if (!trustedSigner) throw new Error("EVIDENCE_SIGNER_ADDRESS is required");
  const bundle = evidenceBundleSchema.parse(raw);
  if ("provider" in bundle.paymentEnvelope) {
    throw new Error("Provider-backed evidence is prepared and stored by the hosted web service");
  }
  const unsigned = { ...bundle.paymentEnvelope.record } as Record<string, unknown>;
  delete unsigned.payloadHash;
  const hashMatches = hashCanonical(unsigned).toLowerCase() === bundle.paymentEnvelope.record.payloadHash.toLowerCase();
  const signatureValid = hashMatches
    && bundle.paymentEnvelope.signer.toLowerCase() === trustedSigner.toLowerCase()
    && await verifyMessage({ address: bundle.paymentEnvelope.signer as Address, message: { raw: bundle.paymentEnvelope.record.payloadHash as Hex }, signature: bundle.paymentEnvelope.signature as Hex });
  if (!signatureValid) throw new Error("Payment evidence signature is invalid or is not from the configured signer");
  return bundle;
}

const server = createServer(async (request, response) => {
  try {
    const origin = request.headers.origin;
    if (origin && allowedOrigins.has(origin)) { response.setHeader("access-control-allow-origin", origin); response.setHeader("vary", "origin"); }
    response.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
    response.setHeader("access-control-allow-headers", "authorization, content-type");
    if (request.method === "OPTIONS") { response.writeHead(origin && !allowedOrigins.has(origin) ? 403 : 204); return response.end(); }
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (request.method === "GET" && url.pathname === "/health") return json(response, 200, { ok: true, service: "veritable-evidence-store", signer: trustedSigner });
    if (request.method === "GET" && url.pathname === "/v1/public-key") return json(response, 200, { signer: trustedSigner });
    const reportMatch = url.pathname.match(/^\/v1\/reports\/(0x[0-9a-fA-F]{64})$/);
    if (request.method === "GET" && reportMatch) {
      const report = await readPublicReport(reportStorePath, reportMatch[1] ?? "");
      return report ? json(response, 200, report) : json(response, 404, { error: "report_not_found" });
    }
    if (request.method === "POST" && url.pathname === "/v1/evidence") {
      if (!ingestToken || request.headers.authorization !== `Bearer ${ingestToken}`) return json(response, 401, { error: "unauthorized" });
      const bundle = await validateBundle(await requestJson(request));
      const evidenceRoot = hashCanonical(bundle);
      const store = await readEvidenceStore();
      store[evidenceRoot.toLowerCase()] = bundle;
      await mkdir(dirname(evidenceStorePath), { recursive: true });
      await writeFile(evidenceStorePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
      return json(response, 201, { evidenceRoot });
    }
    const evidenceMatch = url.pathname.match(/^\/v1\/evidence\/(0x[0-9a-fA-F]{64})$/);
    if (request.method === "GET" && evidenceMatch) {
      const evidenceRoot = evidenceMatch[1]!.toLowerCase();
      const bundle = (await readEvidenceStore())[evidenceRoot];
      return bundle ? json(response, 200, { evidenceBundle: bundle }) : json(response, 404, { error: "evidence_not_found" });
    }
    return json(response, 404, { error: "not_found" });
  } catch (error) {
    return json(response, 400, { error: "invalid_request", message: error instanceof Error ? error.message : "Unknown error" });
  }
});

server.listen(port, "127.0.0.1", () => process.stdout.write(`Veritable evidence service listening on http://127.0.0.1:${port}\n`));
