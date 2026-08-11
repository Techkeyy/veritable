import { z } from "zod";

export const bytes32Schema = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
export const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
export const minorUnitSchema = z.string().regex(/^\d+$/);
export const isoDateSchema = z.iso.date();

export const assetTermsSchema = z.object({
  expectedAmountMinor: minorUnitSchema,
  dueDate: isoDateSchema,
  windowDays: z.number().int().min(0).max(60),
  amountToleranceMinor: minorUnitSchema,
  payerReferenceHash: bytes32Schema,
});

export const evidenceDocumentSchema = z.object({
  id: z.string().min(1),
  contentHash: bytes32Schema,
  mediaType: z.string().min(1),
  kind: z.enum(["LEASE", "RECEIPT", "BANK_SCREENSHOT", "OTHER"]),
  extractedText: z.string().optional(),
});

export const paymentRecordSchema = z.object({
  status: z.enum(["FOUND", "NOT_FOUND", "UNAVAILABLE"]),
  amountMinor: minorUnitSchema.optional(),
  paidAt: isoDateSchema.optional(),
  payerReferenceHash: bytes32Schema.optional(),
  source: z.string().min(1),
  issuedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  signatureValid: z.boolean(),
  payloadHash: bytes32Schema,
});

export const signedPaymentEnvelopeSchema = z.object({
  record: paymentRecordSchema.omit({ signatureValid: true }),
  signer: addressSchema,
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

export const verificationInputSchema = z.object({
  claimId: bytes32Schema,
  assetId: bytes32Schema,
  periodKey: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  claimedAmountMinor: minorUnitSchema,
  currency: z.literal("USDT"),
  assetTerms: assetTermsSchema,
  documents: z.array(evidenceDocumentSchema),
  paymentRecords: z.array(paymentRecordSchema).min(1),
  evidenceRoot: bytes32Schema,
});

export const ruleResultSchema = z.object({
  ruleId: z.string().min(1),
  status: z.enum(["PASS", "FAIL", "UNKNOWN"]),
  message: z.string().min(1),
  evidenceRefs: z.array(z.string()),
});

export const verificationReportSchema = z.object({
  reportVersion: z.literal("1.0"),
  claimId: bytes32Schema,
  assetId: bytes32Schema,
  periodKey: z.string(),
  inputEvidenceRoot: bytes32Schema,
  outcome: z.enum(["VERIFIED", "BLOCKED", "INCONCLUSIVE"]),
  verifiedAmountMinor: minorUnitSchema,
  ruleResults: z.array(ruleResultSchema),
  limitations: z.array(z.string()),
  policyVersion: z.literal("policy-v1"),
  termsHash: bytes32Schema,
  createdAt: z.iso.datetime(),
});

export type AssetTerms = z.infer<typeof assetTermsSchema>;
export type EvidenceDocument = z.infer<typeof evidenceDocumentSchema>;
export type PaymentRecord = z.infer<typeof paymentRecordSchema>;
export type SignedPaymentEnvelope = z.infer<typeof signedPaymentEnvelopeSchema>;
export type VerificationInput = z.infer<typeof verificationInputSchema>;
export type RuleResult = z.infer<typeof ruleResultSchema>;
export type VerificationReport = z.infer<typeof verificationReportSchema>;
