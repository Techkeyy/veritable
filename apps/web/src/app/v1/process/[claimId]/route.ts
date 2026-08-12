import { NextResponse } from "next/server";
import { isHex, type Hex } from "viem";
import { processPublicClaim } from "../../../../lib/serverVerifier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ claimId: string }> }) {
  try {
    const { claimId } = await context.params;
    if (!isHex(claimId, { strict: true }) || claimId.length !== 66) {
      return NextResponse.json({ error: "A bytes32 claim ID is required" }, { status: 400 });
    }
    const result = await processPublicClaim(claimId as Hex);
    return NextResponse.json({
      status: result.report.outcome === "INCONCLUSIVE" ? "INCONCLUSIVE" : result.transactionHash ? "SUBMITTED" : "ALREADY_SUBMITTED",
      outcome: result.report.outcome,
      reportHash: result.reportHash,
      attestationId: result.existingAttestationId,
      transactionHash: result.transactionHash,
    }, { status: result.report.outcome === "INCONCLUSIVE" ? 202 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Verifier request failed";
    return NextResponse.json({ error: message }, { status: message.includes("does not exist") ? 404 : 500 });
  }
}
