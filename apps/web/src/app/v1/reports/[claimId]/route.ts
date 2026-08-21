import { NextResponse } from "next/server";
import { isHex, zeroHash, type Hex } from "viem";
import { buildPublicVerification } from "../../../../lib/serverVerifier";
import { loadClaimEvidence } from "../../../../lib/evidenceStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function respondWithReport(claimId: string, suppliedBundle?: unknown) {
  try {
    if (!isHex(claimId, { strict: true }) || claimId.length !== 66) {
      return NextResponse.json({ error: "A bytes32 claim ID is required" }, { status: 400 });
    }
    const evidenceBundle = suppliedBundle ?? await loadClaimEvidence(claimId as Hex);
    if (!evidenceBundle) return NextResponse.json({ error: "No durable evidence record exists for this claim" }, { status: 404 });
    const result = await buildPublicVerification(claimId as Hex, evidenceBundle);
    return NextResponse.json({
      report: result.report,
      reportHash: result.reportHash,
      attestationId: result.existingAttestationId === zeroHash ? undefined : result.existingAttestationId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Report request failed";
    return NextResponse.json({ error: message }, { status: message.includes("does not exist") ? 404 : 500 });
  }
}

export async function GET(_request: Request, context: { params: Promise<{ claimId: string }> }) {
  const { claimId } = await context.params;
  return respondWithReport(claimId);
}

export async function POST(request: Request, context: { params: Promise<{ claimId: string }> }) {
  const { claimId } = await context.params;
  let suppliedBundle: unknown;
  try {
    suppliedBundle = (await request.json() as { evidenceBundle?: unknown }).evidenceBundle;
  } catch {
    suppliedBundle = undefined;
  }
  return respondWithReport(claimId, suppliedBundle);
}
