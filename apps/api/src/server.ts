import { createServer } from "node:http";
import { resolve } from "node:path";
import dotenv from "dotenv";
import { getAddress, isHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { scenarioRecord, signPaymentRecord, type PaymentScenario } from "./paymentOracle.js";
import { evidenceFixture, evidenceReferenceForRoot } from "./evidenceFixtures.js";
import { readPublicReport } from "./publicReports.js";

dotenv.config({ path: resolve(process.cwd(), "../../.env"), quiet: true });

const DEMO_PRIVATE_KEY = `0x${"01".padStart(64, "0")}` as Hex;
const configuredKey = process.env.EVIDENCE_SIGNER_PRIVATE_KEY;
if (process.env.NODE_ENV === "production" && !configuredKey) {
  throw new Error("EVIDENCE_SIGNER_PRIVATE_KEY is required in production");
}
if (configuredKey && (!isHex(configuredKey) || configuredKey.length !== 66)) {
  throw new Error("EVIDENCE_SIGNER_PRIVATE_KEY must be a 32-byte hex private key");
}
const privateKey = (configuredKey ?? DEMO_PRIVATE_KEY) as Hex;
const signer = getAddress(privateKeyToAccount(privateKey).address);
const port = Number(process.env.PORT ?? 4100);
const reportStorePath = process.env.AGENT_STATE_PATH ?? "../../.verifi/agent-jobs.json";
const allowedOrigins = new Set(
  (process.env.WEB_ALLOWED_ORIGINS ?? "http://localhost:3000,http://127.0.0.1:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);
const scenarios = new Set<PaymentScenario>([
  "rent-paid-exact",
  "rent-underpaid",
  "rent-missing",
  "unavailable",
]);

function json(response: import("node:http").ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  try {
    const origin = request.headers.origin;
    if (origin && allowedOrigins.has(origin)) {
      response.setHeader("access-control-allow-origin", origin);
      response.setHeader("vary", "origin");
    }
    response.setHeader("access-control-allow-methods", "GET, OPTIONS");
    response.setHeader("access-control-allow-headers", "content-type");
    if (request.method === "OPTIONS") {
      response.writeHead(origin && !allowedOrigins.has(origin) ? 403 : 204);
      return response.end();
    }
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (request.method === "GET" && url.pathname === "/health") {
      return json(response, 200, { ok: true, service: "verifi-sandbox-payment-oracle", signer });
    }
    if (request.method === "GET" && url.pathname === "/v1/public-key") {
      return json(response, 200, { signer });
    }
    const reportMatch = url.pathname.match(/^\/v1\/reports\/(0x[0-9a-fA-F]{64})$/);
    if (request.method === "GET" && reportMatch) {
      const report = await readPublicReport(reportStorePath, reportMatch[1] ?? "");
      return report
        ? json(response, 200, report)
        : json(response, 404, { error: "report_not_found" });
    }
    const evidenceMatch = url.pathname.match(/^\/v1\/evidence\/(0x[0-9a-fA-F]{64})$/);
    if (request.method === "GET" && evidenceMatch) {
      const evidenceRoot = evidenceMatch[1] ?? "";
      const paymentReference = evidenceReferenceForRoot(evidenceRoot);
      const claimId = url.searchParams.get("claimId") ?? "";
      const assetId = url.searchParams.get("assetId") ?? "";
      const amountMinor = url.searchParams.get("amountMinor") ?? "";
      if (!paymentReference) return json(response, 404, { error: "unknown_evidence_root" });
      try {
        return json(response, 200, {
          evidence: evidenceFixture(paymentReference, claimId, assetId, amountMinor),
          paymentReference,
        });
      } catch {
        return json(response, 400, { error: "invalid_claim_parameters" });
      }
    }
    const match = url.pathname.match(/^\/v1\/payments\/([^/]+)$/);
    if (request.method === "GET" && match) {
      const scenario = decodeURIComponent(match[1] ?? "") as PaymentScenario;
      if (!scenarios.has(scenario)) return json(response, 404, { error: "unknown_payment_reference" });
      return json(response, 200, await signPaymentRecord(scenarioRecord(scenario, new Date()), privateKey));
    }
    return json(response, 404, { error: "not_found" });
  } catch (error) {
    return json(response, 500, { error: "internal_error", message: error instanceof Error ? error.message : "Unknown error" });
  }
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`VeriFi sandbox payment oracle listening on http://127.0.0.1:${port}\n`);
});
