import { evaluateClaim, hashCanonical } from "@veritable/policy";
import {
  signedPaymentEnvelopeSchema,
  type SignedPaymentEnvelope,
  type VerificationInput,
} from "@veritable/schemas";
import { verifyMessage, type Address, type Hex } from "viem";

export async function verifyPaymentEnvelope(rawEnvelope: SignedPaymentEnvelope, expectedSigner: Address) {
  const envelope = signedPaymentEnvelopeSchema.parse(rawEnvelope);
  const payloadWithoutHash = { ...envelope.record } as Record<string, unknown>;
  delete payloadWithoutHash.payloadHash;
  const hashMatches = hashCanonical(payloadWithoutHash) === envelope.record.payloadHash;
  const signatureValid = hashMatches
    && envelope.signer.toLowerCase() === expectedSigner.toLowerCase()
    && (await verifyMessage({
    address: envelope.signer as Address,
    message: { raw: envelope.record.payloadHash as Hex },
    signature: envelope.signature as `0x${string}`,
  }));
  return { ...envelope.record, signatureValid };
}

export async function verifyClaimFromEnvelope(
  input: Omit<VerificationInput, "paymentRecords">,
  envelope: SignedPaymentEnvelope,
  now: Date,
  expectedSigner: Address,
) {
  const paymentRecord = await verifyPaymentEnvelope(envelope, expectedSigner);
  const report = evaluateClaim({ ...input, paymentRecords: [paymentRecord] }, now);
  return { report, reportHash: hashCanonical(report) };
}
