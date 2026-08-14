import { NextResponse } from "next/server";
import { isAddress, isHex, verifyMessage, type Address, type Hex } from "viem";
import { processPublicClaim } from "../../../../lib/serverVerifier";
import { attestationRequestMessage } from "../../../../lib/attestationRequest";
import { activeChain, networkLabel } from "../../../../lib/chain";
import { storeClaimEvidence } from "../../../../lib/evidenceStorage";
import { evidenceBundleSchema } from "@veritable/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ claimId: string }> }) {
  try {
    const { claimId } = await context.params;
    if (!isHex(claimId, { strict: true }) || claimId.length !== 66) {
      return NextResponse.json({ error: "A bytes32 claim ID is required" }, { status: 400 });
    }
    let body: { requester?: string; signature?: string; evidenceBundle?: unknown };
    try {
      body = await request.json() as typeof body;
    } catch {
      return NextResponse.json({ error: "A JSON issuer authorization is required" }, { status: 400 });
    }
    if (!body.requester || !isAddress(body.requester) || !body.signature || !isHex(body.signature)) {
      return NextResponse.json({ error: "A valid issuer address and signature are required" }, { status: 400 });
    }
    const signatureValid = await verifyMessage({
      address: body.requester as Address,
      message: attestationRequestMessage(claimId, activeChain.id, networkLabel),
      signature: body.signature as Hex,
    });
    if (!signatureValid) return NextResponse.json({ error: "Issuer authorization signature is invalid" }, { status: 401 });
    if (!body.evidenceBundle) return NextResponse.json({ error: "The committed evidence bundle is required" }, { status: 400 });
    const evidenceBundle = evidenceBundleSchema.parse(body.evidenceBundle);
    const result = await processPublicClaim(
      claimId as Hex,
      body.requester as Address,
      evidenceBundle,
      async () => { await storeClaimEvidence(claimId as Hex, evidenceBundle); },
    );
    return NextResponse.json({
      status: result.report.outcome === "INCONCLUSIVE" ? "INCONCLUSIVE" : result.transactionHash ? "SUBMITTED" : "ALREADY_SUBMITTED",
      outcome: result.report.outcome,
      reportHash: result.reportHash,
      report: result.report,
      attestationId: result.existingAttestationId,
      transactionHash: result.transactionHash,
    }, { status: result.report.outcome === "INCONCLUSIVE" ? 202 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Verifier request failed";
    const status = message.includes("does not exist") ? 404 : message.includes("Only the onchain claim issuer") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
