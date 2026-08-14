import { NextResponse } from "next/server";
import { signedPaymentEnvelopeSchema } from "@veritable/schemas";
import { isAddress, isHex, type Address, type Hex } from "viem";
import { loadPaymentRequest, storePaymentRequest } from "../../../../../lib/evidenceStorage";
import { paymentRequestPublicView, verifyPayerConfirmation } from "../../../../../lib/paymentProofs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ requestId: string }>;
}

export async function GET(_request: Request, context: Context) {
  const { requestId } = await context.params;
  const paymentRequest = await loadPaymentRequest(requestId);
  if (!paymentRequest) return NextResponse.json({ error: "Payer confirmation not found" }, { status: 404 });
  return NextResponse.json(paymentRequestPublicView(paymentRequest));
}

export async function POST(request: Request, context: Context) {
  try {
    const { requestId } = await context.params;
    const paymentRequest = await loadPaymentRequest(requestId);
    if (!paymentRequest) return NextResponse.json({ error: "Payer confirmation not found" }, { status: 404 });
    if (paymentRequest.envelope) return NextResponse.json(paymentRequestPublicView(paymentRequest));
    if (Date.parse(paymentRequest.record.expiresAt) < Date.now()) return NextResponse.json({ error: "This confirmation request has expired" }, { status: 410 });
    const body = await request.json() as { payer?: string; signature?: string };
    const payer = String(body.payer || "");
    const signature = String(body.signature || "");
    if (!isAddress(payer) || !isHex(signature)) return NextResponse.json({ error: "A payer signature is required" }, { status: 400 });
    if (!await verifyPayerConfirmation({ request: paymentRequest, payer, signature })) {
      return NextResponse.json({ error: "The payer signature is invalid" }, { status: 401 });
    }
    paymentRequest.envelope = signedPaymentEnvelopeSchema.parse({
      record: paymentRequest.record,
      signer: payer as Address,
      signature: signature as Hex,
    });
    await storePaymentRequest(paymentRequest);
    return NextResponse.json(paymentRequestPublicView(paymentRequest));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not confirm payment";
    return NextResponse.json({ error: message }, { status: message.includes("configured") ? 503 : 400 });
  }
}
