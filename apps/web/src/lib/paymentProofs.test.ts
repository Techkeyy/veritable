import { describe, expect, it } from "vitest";
import { counterpartySource, parsePaymentProof, payerReferenceHash } from "./paymentProofs";

describe("payment proof boundaries", () => {
  it("accepts only a complete BOT transaction reference", () => {
    const txHash = `0x${"ab".repeat(32)}`;
    expect(parsePaymentProof({ kind: "BOT_TRANSACTION", txHash })).toEqual({ kind: "BOT_TRANSACTION", txHash });
    expect(() => parsePaymentProof({ kind: "BOT_TRANSACTION", txHash: "0x12" })).toThrow("incomplete");
  });

  it("derives the same private payer reference regardless of address casing", () => {
    const lower = "0x1111111111111111111111111111111111111111" as const;
    const upper = lower.toUpperCase().replace("0X", "0x") as `0x${string}`;
    expect(payerReferenceHash(lower)).toBe(payerReferenceHash(upper));
  });

  it("binds counterparty confirmation to request, issuer, period, document, and chain", () => {
    expect(counterpartySource({
      requestId: "12345678-1234-1234-1234-123456789abc",
      issuer: "0x1111111111111111111111111111111111111111",
      periodKey: "2026-08",
      documentHash: `0x${"33".repeat(32)}`,
      chainId: 968,
    })).toBe(`COUNTERPARTY_ATTESTATION:12345678-1234-1234-1234-123456789abc:0x1111111111111111111111111111111111111111:2026-08:0x${"33".repeat(32)}:968`);
  });
});
