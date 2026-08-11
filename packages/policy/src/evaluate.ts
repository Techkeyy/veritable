import {
  verificationInputSchema,
  verificationReportSchema,
  type RuleResult,
  type VerificationInput,
  type VerificationReport,
} from "@veritable/schemas";
import { hashCanonical } from "./canonical.js";

function rule(
  ruleId: string,
  status: RuleResult["status"],
  message: string,
  evidenceRefs: string[] = [],
): RuleResult {
  return { ruleId, status, message, evidenceRefs };
}

function differenceInUtcDays(left: string, right: string): number {
  const day = 86_400_000;
  return Math.floor(
    Math.abs(Date.parse(`${left}T00:00:00.000Z`) - Date.parse(`${right}T00:00:00.000Z`)) / day,
  );
}

export function evaluateClaim(
  rawInput: VerificationInput,
  now: Date = new Date(),
): VerificationReport {
  const input = verificationInputSchema.parse(rawInput);
  const results: RuleResult[] = [];
  const record = input.paymentRecords[0];

  if (!record) {
    throw new Error("Schema invariant violated: at least one payment record is required");
  }

  results.push(
    rule(
      "SOURCE_SIGNATURE_VALID",
      record.signatureValid ? "PASS" : "UNKNOWN",
      record.signatureValid
        ? "The primary payment record has a valid source signature."
        : "The primary payment record signature is absent or invalid.",
      [record.payloadHash],
    ),
  );

  const expired = Date.parse(record.expiresAt) < now.getTime();
  results.push(
    rule(
      "SOURCE_RECORD_FRESH",
      expired ? "UNKNOWN" : "PASS",
      expired ? "The primary payment record has expired." : "The primary payment record is fresh.",
      [record.payloadHash],
    ),
  );

  if (record.status === "UNAVAILABLE") {
    results.push(rule("PAYMENT_PRESENT", "UNKNOWN", "The payment source is unavailable."));
  } else if (record.status === "NOT_FOUND") {
    results.push(rule("PAYMENT_PRESENT", "FAIL", "No qualifying payment was found."));
  } else {
    results.push(rule("PAYMENT_PRESENT", "PASS", "A qualifying payment record was found."));
  }

  if (record.status === "FOUND") {
    const detected = BigInt(record.amountMinor ?? "0");
    const claimed = BigInt(input.claimedAmountMinor);
    const expected = BigInt(input.assetTerms.expectedAmountMinor);
    const tolerance = BigInt(input.assetTerms.amountToleranceMinor);
    const amountDelta = detected > claimed ? detected - claimed : claimed - detected;
    const expectedDelta = detected > expected ? detected - expected : expected - detected;
    const amountPass = amountDelta <= tolerance && expectedDelta <= tolerance;

    results.push(
      rule(
        "AMOUNT_MATCHES",
        amountPass ? "PASS" : "FAIL",
        amountPass
          ? "Detected payment matches the claimed and expected amounts."
          : `Detected ${detected} minor units; claimed ${claimed}; expected ${expected}.`,
        [record.payloadHash],
      ),
    );

    const payerPass = record.payerReferenceHash === input.assetTerms.payerReferenceHash;
    results.push(
      rule(
        "PAYER_MATCHES",
        payerPass ? "PASS" : "FAIL",
        payerPass
          ? "The redacted payer reference matches the registered terms."
          : "The payment originated from a different payer reference.",
        [record.payloadHash],
      ),
    );

    const datePass = record.paidAt
      ? differenceInUtcDays(record.paidAt, input.assetTerms.dueDate) <= input.assetTerms.windowDays
      : false;
    results.push(
      rule(
        "DATE_IN_WINDOW",
        datePass ? "PASS" : "FAIL",
        datePass
          ? "The payment date is inside the configured window."
          : "The payment date is missing or outside the configured window.",
        [record.payloadHash],
      ),
    );
  }

  const hasUnknown = results.some((item) => item.status === "UNKNOWN");
  const hasFailure = results.some((item) => item.status === "FAIL");
  const outcome = hasUnknown ? "INCONCLUSIVE" : hasFailure ? "BLOCKED" : "VERIFIED";
  const verifiedAmountMinor = outcome === "VERIFIED" ? input.claimedAmountMinor : "0";

  return verificationReportSchema.parse({
    reportVersion: "1.0",
    claimId: input.claimId,
    assetId: input.assetId,
    periodKey: input.periodKey,
    inputEvidenceRoot: input.evidenceRoot,
    outcome,
    verifiedAmountMinor,
    ruleResults: results,
    limitations: [
      "The sandbox payment source demonstrates the verification mechanism; it is not a production bank feed.",
      "Asset ownership and legal investor eligibility are outside this automated verdict.",
    ],
    policyVersion: "policy-v1",
    termsHash: hashCanonical(input.assetTerms),
    createdAt: now.toISOString(),
  });
}
