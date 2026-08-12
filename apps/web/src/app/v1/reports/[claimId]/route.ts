import { NextResponse } from "next/server";
import { isHex, zeroHash, type Hex } from "viem";
import { buildPublicVerification } from "../../../../lib/serverVerifier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ claimId: string }> }) {
  try {
    const { claimId } = await context.params;
    if (!isHex(claimId, { strict: true }) || claimId.length !== 66) {
      return NextResponse.json({ error: "A bytes32 claim ID is required" }, { status: 400 });
    }
    const result = await buildPublicVerification(claimId as Hex);
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
