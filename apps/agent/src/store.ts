import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import type { VerificationReport } from "@veritable/schemas";

const hexSchema = z.string().regex(/^0x[0-9a-fA-F]+$/);
export const claimEventSchema = z.object({
  chainId: z.number().int().positive(),
  transactionHash: hexSchema,
  logIndex: z.number().int().nonnegative(),
  blockNumber: z.string().regex(/^\d+$/),
  claimId: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  assetId: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  periodKey: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  issuer: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  amountMinor: z.string().regex(/^\d+$/),
  evidenceRoot: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
});

export type ClaimEvent = z.infer<typeof claimEventSchema>;
export type JobStatus =
  | "RECEIVED"
  | "PROCESSING"
  | "INCONCLUSIVE"
  | "SUBMITTED"
  | "FAILED"
  | "DEAD_LETTER";

export interface ClaimJob {
  key: string;
  event: ClaimEvent;
  status: JobStatus;
  attempts: number;
  reportHash?: string;
  report?: VerificationReport;
  attestationTransactionHash?: string;
  existingAttestationId?: string;
  lastError?: string;
  updatedAt: string;
}

interface StoreFile {
  version: 1;
  lastProcessedBlock: Record<string, string>;
  jobs: Record<string, ClaimJob>;
}

const EMPTY_STORE: StoreFile = { version: 1, lastProcessedBlock: {}, jobs: {} };

export function eventKey(event: ClaimEvent): string {
  return `${event.chainId}:${event.transactionHash.toLowerCase()}:${event.logIndex}`;
}

export interface JobStore {
  get(key: string): Promise<ClaimJob | undefined>;
  put(job: ClaimJob): Promise<void>;
  getLastProcessedBlock(chainId: number): Promise<bigint | undefined>;
  setLastProcessedBlock(chainId: number, blockNumber: bigint): Promise<void>;
}

export class MemoryJobStore implements JobStore {
  private jobs = new Map<string, ClaimJob>();
  private cursors = new Map<number, bigint>();

  async get(key: string) {
    return this.jobs.get(key);
  }

  async put(job: ClaimJob) {
    this.jobs.set(job.key, structuredClone(job));
  }

  async getLastProcessedBlock(chainId: number) {
    return this.cursors.get(chainId);
  }

  async setLastProcessedBlock(chainId: number, blockNumber: bigint) {
    this.cursors.set(chainId, blockNumber);
  }
}

export class FileJobStore implements JobStore {
  private data: StoreFile = structuredClone(EMPTY_STORE);
  private writeQueue: Promise<void> = Promise.resolve();

  private constructor(private readonly filePath: string) {}

  static async open(filePath: string): Promise<FileJobStore> {
    const store = new FileJobStore(filePath);
    try {
      const raw = await readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as StoreFile;
      if (parsed.version !== 1 || typeof parsed.jobs !== "object") {
        throw new Error("Unsupported job-store format");
      }
      store.data = parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await store.persist();
    }
    return store;
  }

  async get(key: string) {
    const job = this.data.jobs[key];
    return job ? structuredClone(job) : undefined;
  }

  async put(job: ClaimJob) {
    this.data.jobs[job.key] = structuredClone(job);
    await this.persist();
  }

  async getLastProcessedBlock(chainId: number) {
    const value = this.data.lastProcessedBlock[String(chainId)];
    return value === undefined ? undefined : BigInt(value);
  }

  async setLastProcessedBlock(chainId: number, blockNumber: bigint) {
    this.data.lastProcessedBlock[String(chainId)] = blockNumber.toString();
    await this.persist();
  }

  private async persist() {
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      const temporaryPath = `${this.filePath}.tmp`;
      await writeFile(temporaryPath, `${JSON.stringify(this.data, null, 2)}\n`, "utf8");
      await rename(temporaryPath, this.filePath);
    });
    await this.writeQueue;
  }
}
