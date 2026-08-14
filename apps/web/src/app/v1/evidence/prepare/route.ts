import { NextResponse } from "next/server";
import { assetTermsSchema } from "@veritable/schemas";
import { isAddress, isHex, keccak256, verifyMessage, type Address, type Hex } from "viem";
import { activeChain } from "../../../../lib/chain";
import { evidencePreparationMessage } from "../../../../lib/evidenceAuthorization";
import { storePreparedEvidence } from "../../../../lib/evidenceStorage";
import { prepareLiveEvidence } from "../../../../lib/liveProviders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("document");
    const requester = String(form.get("requester") || "");
    const signature = String(form.get("signature") || "");
    const periodKey = String(form.get("periodKey") || "");
    if (!(file instanceof File)) return NextResponse.json({ error: "An evidence document is required" }, { status: 400 });
    if (!isAddress(requester) || !isHex(signature)) return NextResponse.json({ error: "A wallet authorization is required" }, { status: 401 });
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodKey)) return NextResponse.json({ error: "A YYYY-MM period is required" }, { status: 400 });
    const assetTerms = assetTermsSchema.parse(JSON.parse(String(form.get("assetTerms") || "{}")));
    const documentHash = keccak256(new Uint8Array(await file.arrayBuffer()));
    const authorized = await verifyMessage({
      address: requester as Address,
      signature: signature as Hex,
      message: evidencePreparationMessage({
        requester: requester as Address,
        periodKey,
        payerReferenceHash: assetTerms.payerReferenceHash as Hex,
        documentHash,
        chainId: activeChain.id,
      }),
    });
    if (!authorized) return NextResponse.json({ error: "Evidence preparation signature is invalid" }, { status: 401 });
    const paymentEnvelope = JSON.parse(String(form.get("paymentEnvelope") || "{}"));
    const prepared = await prepareLiveEvidence({ file, periodKey, rawAssetTerms: assetTerms, rawPaymentEnvelope: paymentEnvelope });
    const storage = await storePreparedEvidence({ requester: requester as Address, file, documentHash, bundle: prepared.bundle });
    return NextResponse.json({
      evidenceBundle: prepared.bundle,
      providerRunId: prepared.providerRunId,
      storage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Evidence preparation failed";
    const status = message.includes("not configured") ? 503 : message.includes("failed (") ? 502 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
