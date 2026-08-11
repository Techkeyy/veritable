import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { keccak256, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hashCanonical } from "@veritable/policy";
import type { SignedPaymentEnvelope, VerificationInput } from "@veritable/schemas";
import { ClaimProcessor } from "./processor.js";
import { FileJobStore, MemoryJobStore, type ClaimEvent } from "./store.js";

const HASH_A = `0x${"11".repeat(32)}`;
const HASH_B = `0x${"22".repeat(32)}`;
const HASH_C = `0x${"33".repeat(32)}`;
const PERIOD_HASH = keccak256(stringToHex("2026-08"));
const TX_HASH = `0x${"44".repeat(32)}`;
const PRIVATE_KEY = `0x${"01".padStart(64, "0")}` as const;
const TRUSTED_SIGNER = privateKeyToAccount(PRIVATE_KEY).address;
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

const event: ClaimEvent = {
  chainId: 968,
  transactionHash: TX_HASH,
  logIndex: 0,
  blockNumber: "100",
  claimId: HASH_A,
  assetId: HASH_B,
  periodKey: PERIOD_HASH,
  issuer: `0x${"55".repeat(20)}`,
  amountMinor: "2000000000",
  evidenceRoot: HASH_C,
};

const evidence: Omit<VerificationInput, "paymentRecords"> = {
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
    payerReferenceHash: HASH_C,
  },
  documents: [],
  evidenceRoot: HASH_C,
};

async function payment(status: "FOUND" | "UNAVAILABLE" = "FOUND"): Promise<SignedPaymentEnvelope> {
  const account = privateKeyToAccount(PRIVATE_KEY);
  const raw = status === "FOUND"
    ? {
        status,
        amountMinor: "2000000000",
        paidAt: "2026-08-02",
        payerReferenceHash: HASH_C,
        source: "verifi-sandbox-rail",
        issuedAt: "2026-08-02T00:00:00.000Z",
        expiresAt: "2026-09-01T00:00:00.000Z",
      }
    : {
        status,
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

describe("claim processor", () => {
  it("records an already-attested on-chain claim without refetching evidence or spending gas", async () => {
    let fetches = 0;
    let submissions = 0;
    const processor = new ClaimProcessor({
      store: new MemoryJobStore(),
      trustedPaymentSigner: TRUSTED_SIGNER,
      findExistingAttestation: async () => HASH_B,
      fetchEvidence: async () => {
        fetches += 1;
        return evidence;
      },
      fetchPayment: async () => payment(),
      submitAttestation: async () => {
        submissions += 1;
        return TX_HASH;
      },
      now: () => new Date("2026-08-03T00:00:00.000Z"),
    });
    const job = await processor.process(event);
    expect(job.status).toBe("SUBMITTED");
    expect(job.existingAttestationId).toBe(HASH_B);
    expect(fetches).toBe(0);
    expect(submissions).toBe(0);
  });

  it("submits exactly once when the same log is delivered twice", async () => {
    const store = new MemoryJobStore();
    let submissions = 0;
    const processor = new ClaimProcessor({
      store,
      trustedPaymentSigner: TRUSTED_SIGNER,
      fetchEvidence: async () => evidence,
      fetchPayment: async () => payment(),
      submitAttestation: async () => {
        submissions += 1;
        return TX_HASH;
      },
      now: () => new Date("2026-08-03T00:00:00.000Z"),
    });
    expect((await processor.process(event)).status).toBe("SUBMITTED");
    expect((await processor.process(event)).status).toBe("SUBMITTED");
    expect(submissions).toBe(1);
  });

  it("persists completed jobs and the block cursor across restarts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "verifi-agent-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "jobs.json");
    const firstStore = await FileJobStore.open(path);
    const processor = new ClaimProcessor({
      store: firstStore,
      trustedPaymentSigner: TRUSTED_SIGNER,
      fetchEvidence: async () => evidence,
      fetchPayment: async () => payment(),
      submitAttestation: async () => TX_HASH,
    });
    await processor.process(event);
    await firstStore.setLastProcessedBlock(968, 100n);
    const reopened = await FileJobStore.open(path);
    expect((await reopened.get(`968:${TX_HASH}:0`))?.status).toBe("SUBMITTED");
    expect(await reopened.getLastProcessedBlock(968)).toBe(100n);
  });

  it("does not submit an inconclusive result", async () => {
    let submissions = 0;
    const processor = new ClaimProcessor({
      store: new MemoryJobStore(),
      trustedPaymentSigner: TRUSTED_SIGNER,
      fetchEvidence: async () => evidence,
      fetchPayment: async () => payment("UNAVAILABLE"),
      submitAttestation: async () => {
        submissions += 1;
        return TX_HASH;
      },
      now: () => new Date("2026-08-03T00:00:00.000Z"),
    });
    expect((await processor.process(event)).status).toBe("INCONCLUSIVE");
    expect(submissions).toBe(0);
  });

  it("rejects evidence that does not match the on-chain commitment", async () => {
    const processor = new ClaimProcessor({
      store: new MemoryJobStore(),
      trustedPaymentSigner: TRUSTED_SIGNER,
      fetchEvidence: async () => ({ ...evidence, claimedAmountMinor: "1" }),
      fetchPayment: async () => payment(),
      submitAttestation: async () => TX_HASH,
    });
    await expect(processor.process(event)).rejects.toThrow(/does not match/);
  });

  it("rejects evidence for a different revenue period", async () => {
    const processor = new ClaimProcessor({
      store: new MemoryJobStore(),
      trustedPaymentSigner: TRUSTED_SIGNER,
      fetchEvidence: async () => ({ ...evidence, periodKey: "2026-07" }),
      fetchPayment: async () => payment(),
      submitAttestation: async () => TX_HASH,
    });
    await expect(processor.process(event)).rejects.toThrow(/does not match/);
  });

  it("moves a persistently failing claim to dead letter after bounded retries", async () => {
    let fetches = 0;
    const processor = new ClaimProcessor({
      store: new MemoryJobStore(),
      trustedPaymentSigner: TRUSTED_SIGNER,
      maxAttempts: 3,
      fetchEvidence: async () => {
        fetches += 1;
        throw new Error("source offline");
      },
      fetchPayment: async () => payment(),
      submitAttestation: async () => TX_HASH,
    });
    await expect(processor.process(event)).rejects.toThrow("source offline");
    await expect(processor.process(event)).rejects.toThrow("source offline");
    await expect(processor.process(event)).rejects.toThrow("source offline");
    expect((await processor.process(event)).status).toBe("DEAD_LETTER");
    expect(fetches).toBe(3);
  });
});
