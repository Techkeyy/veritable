import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import type { SignedPaymentEnvelope, VerificationInput } from "@veritable/schemas";
import { hashCanonical } from "@veritable/policy";
import { verifyClaimFromEnvelope, verifyPaymentEnvelope } from "./verify.js";

const PRIVATE_KEY = `0x${"01".padStart(64, "0")}` as const;
const TRUSTED_SIGNER = privateKeyToAccount(PRIVATE_KEY).address;
const HASH_A = `0x${"11".repeat(32)}`;
const HASH_B = `0x${"22".repeat(32)}`;
const PAYER = `0x${"33".repeat(32)}`;
const NOW = new Date("2026-08-03T00:00:00.000Z");

async function envelope(amountMinor = "2000000000"): Promise<SignedPaymentEnvelope> {
  const account = privateKeyToAccount(PRIVATE_KEY);
  const raw = {
    status: "FOUND" as const,
    amountMinor,
    paidAt: "2026-08-02",
    payerReferenceHash: PAYER,
    source: "verifi-sandbox-rail",
    issuedAt: "2026-08-02T00:00:00.000Z",
    expiresAt: "2026-09-01T00:00:00.000Z",
  };
  const payloadHash = hashCanonical(raw);
  return {
    record: { ...raw, payloadHash },
    signer: account.address,
    signature: await account.signMessage({ message: { raw: payloadHash } }),
  };
}

const input: Omit<VerificationInput, "paymentRecords"> = {
  claimId: HASH_A,
  assetId: HASH_B,
  periodKey: "2026-08",
  claimedAmountMinor: "2000000000",
  currency: "USDT",
  assetTerms: {
    expectedAmountMinor: "2000000000",
    dueDate: "2026-08-01",
    windowDays: 5,
    amountToleranceMinor: "0",
    payerReferenceHash: PAYER,
  },
  documents: [],
  evidenceRoot: HASH_A,
};

describe("agent evidence verification", () => {
  it("verifies the signed source before approving a valid claim", async () => {
    const result = await verifyClaimFromEnvelope(input, await envelope(), NOW, TRUSTED_SIGNER);
    expect(result.report.outcome).toBe("VERIFIED");
    expect(result.reportHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("blocks a signed underpayment", async () => {
    const result = await verifyClaimFromEnvelope(input, await envelope("1200000000"), NOW, TRUSTED_SIGNER);
    expect(result.report.outcome).toBe("BLOCKED");
  });

  it("fails closed when payload content is changed after signing", async () => {
    const tampered = await envelope();
    tampered.record.amountMinor = "9999999999";
    expect((await verifyPaymentEnvelope(tampered, TRUSTED_SIGNER)).signatureValid).toBe(false);
    const result = await verifyClaimFromEnvelope(input, tampered, NOW, TRUSTED_SIGNER);
    expect(result.report.outcome).toBe("INCONCLUSIVE");
  });

  it("rejects a valid signature from an untrusted source", async () => {
    const otherSigner = privateKeyToAccount(`0x${"02".padStart(64, "0")}`);
    const signed = await envelope();
    expect((await verifyPaymentEnvelope(signed, otherSigner.address)).signatureValid).toBe(false);
  });
});
