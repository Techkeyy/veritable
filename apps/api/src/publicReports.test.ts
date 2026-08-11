import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readPublicReport } from "./publicReports.js";

const temporaryDirectories: string[] = [];
const CLAIM_ID = `0x${"11".repeat(32)}`;
const ASSET_ID = `0x${"22".repeat(32)}`;
const TX_HASH = `0x${"33".repeat(32)}`;

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("public verification reports", () => {
  it("returns only the redacted report projection for a claim", async () => {
    const directory = await mkdtemp(join(tmpdir(), "verifi-reports-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "jobs.json");
    await writeFile(path, JSON.stringify({
      version: 1,
      lastProcessedBlock: { "968": "100" },
      jobs: {
        job: {
          event: { chainId: 968, claimId: CLAIM_ID, assetId: ASSET_ID, transactionHash: TX_HASH },
          status: "SUBMITTED",
          attempts: 1,
          reportHash: ASSET_ID,
          attestationTransactionHash: TX_HASH,
          updatedAt: "2026-08-03T00:00:00.000Z",
          report: {
            reportVersion: "1.0",
            claimId: CLAIM_ID,
            assetId: ASSET_ID,
            periodKey: "2026-08",
            inputEvidenceRoot: TX_HASH,
            outcome: "VERIFIED",
            verifiedAmountMinor: "2000000000",
            ruleResults: [{ ruleId: "AMOUNT_MATCHES", status: "PASS", message: "Matched.", evidenceRefs: [TX_HASH] }],
            limitations: ["Sandbox source."],
            policyVersion: "policy-v1",
            termsHash: ASSET_ID,
            createdAt: "2026-08-03T00:00:00.000Z",
          },
        },
      },
    }), "utf8");
    const result = await readPublicReport(path, CLAIM_ID);
    expect(result?.report.outcome).toBe("VERIFIED");
    expect(result).not.toHaveProperty("lastProcessedBlock");
    expect(result).not.toHaveProperty("attempts");
  });

  it("returns undefined when no persisted report exists", async () => {
    expect(await readPublicReport("missing-report-file.json", CLAIM_ID)).toBeUndefined();
  });
});
