import type { SignedPaymentEnvelope, VerificationInput, VerificationReport } from "@veritable/schemas";
import { keccak256, stringToHex } from "viem";
import type { Address } from "viem";
import { verifyClaimFromEnvelope } from "./verify.js";
import {
  claimEventSchema,
  eventKey,
  type ClaimEvent,
  type ClaimJob,
  type JobStore,
} from "./store.js";

export interface ProcessorDependencies {
  store: JobStore;
  fetchEvidence(event: ClaimEvent): Promise<Omit<VerificationInput, "paymentRecords">>;
  fetchPayment(event: ClaimEvent): Promise<SignedPaymentEnvelope>;
  submitAttestation(event: ClaimEvent, report: VerificationReport, reportHash: string): Promise<string>;
  findExistingAttestation?(event: ClaimEvent): Promise<string | undefined>;
  trustedPaymentSigner: Address;
  maxAttempts?: number;
  now?: () => Date;
}

export class ClaimProcessor {
  constructor(private readonly dependencies: ProcessorDependencies) {}

  async process(rawEvent: ClaimEvent): Promise<ClaimJob> {
    const event = claimEventSchema.parse(rawEvent);
    const key = eventKey(event);
    const existing = await this.dependencies.store.get(key);
    if (
      existing?.status === "SUBMITTED"
      || existing?.status === "INCONCLUSIVE"
      || existing?.status === "DEAD_LETTER"
    ) return existing;

    const now = this.dependencies.now?.() ?? new Date();
    const existingAttestationId = await this.dependencies.findExistingAttestation?.(event);
    if (existingAttestationId) {
      const alreadySubmitted: ClaimJob = {
        key,
        event,
        status: "SUBMITTED",
        attempts: existing?.attempts ?? 0,
        existingAttestationId,
        updatedAt: now.toISOString(),
      };
      await this.dependencies.store.put(alreadySubmitted);
      return alreadySubmitted;
    }
    const processing: ClaimJob = {
      key,
      event,
      status: "PROCESSING",
      attempts: (existing?.attempts ?? 0) + 1,
      updatedAt: now.toISOString(),
    };
    await this.dependencies.store.put(processing);

    try {
      const [evidence, payment] = await Promise.all([
        this.dependencies.fetchEvidence(event),
        this.dependencies.fetchPayment(event),
      ]);
      if (
        evidence.claimId.toLowerCase() !== event.claimId.toLowerCase()
        || evidence.assetId.toLowerCase() !== event.assetId.toLowerCase()
        || keccak256(stringToHex(evidence.periodKey)).toLowerCase() !== event.periodKey.toLowerCase()
        || evidence.evidenceRoot.toLowerCase() !== event.evidenceRoot.toLowerCase()
        || evidence.claimedAmountMinor !== event.amountMinor
      ) {
        throw new Error("Fetched evidence does not match the on-chain claim commitment");
      }
      const { report, reportHash } = await verifyClaimFromEnvelope(
        evidence,
        payment,
        now,
        this.dependencies.trustedPaymentSigner,
      );
      if (report.outcome === "INCONCLUSIVE") {
        const inconclusive: ClaimJob = {
          ...processing,
          status: "INCONCLUSIVE",
          reportHash,
          report,
          updatedAt: (this.dependencies.now?.() ?? new Date()).toISOString(),
        };
        await this.dependencies.store.put(inconclusive);
        return inconclusive;
      }
      const transactionHash = await this.dependencies.submitAttestation(
        event,
        report,
        reportHash,
      );
      const submitted: ClaimJob = {
        ...processing,
        status: "SUBMITTED",
        reportHash,
        report,
        attestationTransactionHash: transactionHash,
        updatedAt: (this.dependencies.now?.() ?? new Date()).toISOString(),
      };
      await this.dependencies.store.put(submitted);
      return submitted;
    } catch (error) {
      const terminal = processing.attempts >= (this.dependencies.maxAttempts ?? 5);
      const failed: ClaimJob = {
        ...processing,
        status: terminal ? "DEAD_LETTER" : "FAILED",
        lastError: error instanceof Error ? error.message : "Unknown processor error",
        updatedAt: (this.dependencies.now?.() ?? new Date()).toISOString(),
      };
      await this.dependencies.store.put(failed);
      throw error;
    }
  }
}
