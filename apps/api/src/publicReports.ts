import { readFile } from "node:fs/promises";
import { verificationReportSchema } from "@veritable/schemas";
import { z } from "zod";

const storedJobSchema = z.object({
  event: z.object({
    chainId: z.number().int().positive(),
    claimId: z.string(),
    assetId: z.string(),
    transactionHash: z.string(),
  }),
  status: z.enum(["RECEIVED", "PROCESSING", "INCONCLUSIVE", "SUBMITTED", "FAILED", "DEAD_LETTER"]),
  reportHash: z.string().optional(),
  report: verificationReportSchema.optional(),
  attestationTransactionHash: z.string().optional(),
  updatedAt: z.string(),
});

const storeFileSchema = z.object({
  version: z.literal(1),
  jobs: z.record(z.string(), storedJobSchema),
});

export async function readPublicReport(filePath: string, claimId: string) {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  const data = storeFileSchema.parse(JSON.parse(raw));
  const match = Object.values(data.jobs)
    .filter((job) => job.event.claimId.toLowerCase() === claimId.toLowerCase() && job.report)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  if (!match?.report || !match.reportHash) return undefined;
  return {
    chainId: match.event.chainId,
    claimId: match.event.claimId,
    assetId: match.event.assetId,
    claimTransactionHash: match.event.transactionHash,
    status: match.status,
    reportHash: match.reportHash,
    attestationTransactionHash: match.attestationTransactionHash,
    report: match.report,
    updatedAt: match.updatedAt,
  };
}
