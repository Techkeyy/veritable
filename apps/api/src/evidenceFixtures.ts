import { keccak256, stringToHex } from "viem";
import type { VerificationInput } from "@veritable/schemas";

export const DEMO_ASSET_ID = keccak256(stringToHex("asset:verifi-solar-001"));
export const DEMO_PAYER_REFERENCE = `0x${"33".repeat(32)}`;
export const EVIDENCE_ROOTS = {
  "rent-paid-exact": keccak256(stringToHex("evidence:exact-payment")),
  "rent-underpaid": keccak256(stringToHex("evidence:underpaid")),
  "rent-missing": keccak256(stringToHex("evidence:missing")),
  unavailable: keccak256(stringToHex("evidence:unavailable")),
} as const;

export type EvidenceReference = keyof typeof EVIDENCE_ROOTS;

export function evidenceReferenceForRoot(root: string): EvidenceReference | undefined {
  return (Object.entries(EVIDENCE_ROOTS).find(([, value]) => value.toLowerCase() === root.toLowerCase())?.[0]) as
    | EvidenceReference
    | undefined;
}

export function evidenceFixture(
  paymentReference: EvidenceReference,
  claimId: string,
  assetId: string,
  claimedAmountMinor: string,
): Omit<VerificationInput, "paymentRecords"> {
  return {
    claimId,
    assetId,
    periodKey: "2026-08",
    claimedAmountMinor,
    currency: "USDT",
    assetTerms: {
      expectedAmountMinor: "2000000000",
      dueDate: "2026-08-01",
      windowDays: 5,
      amountToleranceMinor: "0",
      payerReferenceHash: DEMO_PAYER_REFERENCE,
    },
    documents: [
      {
        id: "lease-2026-demo",
        contentHash: keccak256(stringToHex("redacted-demo-lease-v1")),
        mediaType: "application/pdf",
        kind: "LEASE",
        extractedText: "Redacted sandbox lease: monthly rent 2,000 USDT; due on day 1.",
      },
    ],
    evidenceRoot: EVIDENCE_ROOTS[paymentReference],
  };
}
