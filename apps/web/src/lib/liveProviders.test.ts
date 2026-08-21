import { evaluateClaim } from "@veritable/policy";
import { describe, expect, it, vi } from "vitest";

import {
  IncompleteLiveExtractionError,
  extractCompleteDocumentWithRetry,
} from "./liveProviders";

const HASH_A = `0x${"11".repeat(32)}` as const;
const HASH_B = `0x${"22".repeat(32)}` as const;
const HASH_C = `0x${"33".repeat(32)}` as const;
const file = new File(["Amount due: 0.01 USDT. Due date: 2026-08-21."], "income.txt", { type: "text/plain" });

function extraction(extractedFacts?: { expectedAmountMinor?: string; dueDate?: string }) {
  return {
    document: {
      id: "deepseek:test:income.txt",
      contentHash: HASH_A,
      mediaType: "text/plain",
      kind: "LEASE" as const,
      extractedText: "Canonical income statement",
      extractedFacts,
    },
    modelRunHash: HASH_B,
    providerRunId: "test-run",
  };
}

describe("live extraction completeness", () => {
  it("accepts a complete amount and date without retrying", async () => {
    const extractor = vi.fn().mockResolvedValue(extraction({ expectedAmountMinor: "10000", dueDate: "2026-08-21" }));
    await expect(extractCompleteDocumentWithRetry(file, extractor)).resolves.toEqual(expect.objectContaining({ providerRunId: "test-run" }));
    expect(extractor).toHaveBeenCalledTimes(1);
  });

  it("retries once when amount is missing, then accepts a complete extraction", async () => {
    const extractor = vi.fn()
      .mockResolvedValueOnce(extraction({ dueDate: "2026-08-21" }))
      .mockResolvedValueOnce(extraction({ expectedAmountMinor: "10000", dueDate: "2026-08-21" }));
    await expect(extractCompleteDocumentWithRetry(file, extractor)).resolves.toBeDefined();
    expect(extractor).toHaveBeenCalledTimes(2);
  });

  it("retries once when date is missing, then accepts a complete extraction", async () => {
    const extractor = vi.fn()
      .mockResolvedValueOnce(extraction({ expectedAmountMinor: "10000" }))
      .mockResolvedValueOnce(extraction({ expectedAmountMinor: "10000", dueDate: "2026-08-21" }));
    await expect(extractCompleteDocumentWithRetry(file, extractor)).resolves.toBeDefined();
    expect(extractor).toHaveBeenCalledTimes(2);
  });

  it("fails closed after two incomplete attempts and never makes a third call", async () => {
    const extractor = vi.fn().mockResolvedValue(extraction({ dueDate: "2026-08-21" }));
    await expect(extractCompleteDocumentWithRetry(file, extractor)).rejects.toBeInstanceOf(IncompleteLiveExtractionError);
    expect(extractor).toHaveBeenCalledTimes(2);
  });

  it("retries an unparseable structured fact and fails closed after the second attempt", async () => {
    const extractor = vi.fn().mockResolvedValue(extraction({ expectedAmountMinor: "not-an-amount", dueDate: "2026-99-99" }));
    await expect(extractCompleteDocumentWithRetry(file, extractor)).rejects.toBeInstanceOf(IncompleteLiveExtractionError);
    expect(extractor).toHaveBeenCalledTimes(2);
  });
});

describe("live extraction mismatch semantics", () => {
  it("does not retry a complete amount mismatch", async () => {
    const extractor = vi.fn().mockResolvedValue(extraction({ expectedAmountMinor: "9999", dueDate: "2026-08-21" }));
    const result = await extractCompleteDocumentWithRetry(file, extractor);
    expect(result.document.extractedFacts?.expectedAmountMinor).toBe("9999");
    expect(extractor).toHaveBeenCalledTimes(1);
  });

  it("does not retry a complete date mismatch", async () => {
    const extractor = vi.fn().mockResolvedValue(extraction({ expectedAmountMinor: "10000", dueDate: "2026-08-20" }));
    const result = await extractCompleteDocumentWithRetry(file, extractor);
    expect(result.document.extractedFacts?.dueDate).toBe("2026-08-20");
    expect(extractor).toHaveBeenCalledTimes(1);
  });

  it("preserves a complete mismatch for deterministic BLOCKED evaluation", () => {
    const report = evaluateClaim({
      claimId: HASH_A,
      assetId: HASH_B,
      periodKey: "2026-08",
      claimedAmountMinor: "10000",
      currency: "USDT",
      assetTerms: {
        expectedAmountMinor: "10000",
        dueDate: "2026-08-21",
        windowDays: 5,
        amountToleranceMinor: "0",
        payerReferenceHash: HASH_C,
      },
      documents: [extraction({ expectedAmountMinor: "9999", dueDate: "2026-08-21" }).document],
      paymentRecords: [{
        status: "FOUND",
        amountMinor: "10000",
        paidAt: "2026-08-21",
        payerReferenceHash: HASH_C,
        source: "test",
        issuedAt: "2026-08-21T00:00:00.000Z",
        expiresAt: "2099-01-01T00:00:00.000Z",
        signatureValid: true,
        payloadHash: HASH_C,
      }],
      evidenceRoot: HASH_C,
      extractionRequired: true,
    }, new Date("2026-08-21T12:00:00.000Z"));
    expect(report.outcome).toBe("BLOCKED");
    expect(report.ruleResults).toHaveLength(8);
    expect(report.ruleResults.find((rule) => rule.ruleId === "AI_TERMS_MATCH")?.status).toBe("FAIL");
  });
});
