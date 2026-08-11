import { hashCanonical } from "@veritable/policy";
import { signedPaymentEnvelopeSchema, type PaymentRecord } from "@veritable/schemas";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";

const PAYER = `0x${"33".repeat(32)}`;

export type PaymentScenario = "rent-paid-exact" | "rent-underpaid" | "rent-missing" | "unavailable";

export interface UnsignedPaymentRecord extends Omit<PaymentRecord, "signatureValid"> {}

export function scenarioRecord(scenario: PaymentScenario, now = new Date("2026-08-03T00:00:00.000Z")): UnsignedPaymentRecord {
  const common = {
    source: "verifi-sandbox-rail",
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 30 * 86_400_000).toISOString(),
  };
  const raw =
    scenario === "rent-paid-exact"
      ? { ...common, status: "FOUND" as const, amountMinor: "2000000000", paidAt: "2026-08-02", payerReferenceHash: PAYER }
      : scenario === "rent-underpaid"
        ? { ...common, status: "FOUND" as const, amountMinor: "1200000000", paidAt: "2026-08-02", payerReferenceHash: PAYER }
        : scenario === "rent-missing"
          ? { ...common, status: "NOT_FOUND" as const }
          : { ...common, status: "UNAVAILABLE" as const };
  return { ...raw, payloadHash: hashCanonical(raw) };
}

export async function signPaymentRecord(record: UnsignedPaymentRecord, privateKey: Hex) {
  const account = privateKeyToAccount(privateKey);
  const signature = await account.signMessage({ message: { raw: record.payloadHash as Hex } });
  return signedPaymentEnvelopeSchema.parse({ record, signer: account.address, signature });
}
