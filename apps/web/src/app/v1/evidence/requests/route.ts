import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { hashCanonical } from "@veritable/policy";
import { isAddress, isHex, verifyMessage, type Address, type Hex } from "viem";
import { activeChain } from "../../../../lib/chain";
import { evidenceRequestMessage } from "../../../../lib/evidenceAuthorization";
import { storePaymentRequest, type PaymentRequestRecord } from "../../../../lib/evidenceStorage";
import { counterpartySource, payerReferenceHash } from "../../../../lib/paymentProofs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const issuer = String(body.issuer || "");
    const payer = String(body.payer || "");
    const periodKey = String(body.periodKey || "");
    const amountMinor = String(body.amountMinor || "");
    const paidAt = String(body.paidAt || "");
    const documentHash = String(body.documentHash || "");
    const signature = String(body.signature || "");
    if (!isAddress(issuer) || !isAddress(payer) || !isHex(signature)) throw new Error("Issuer and payer wallets are required");
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodKey)) throw new Error("A YYYY-MM period is required");
    if (!/^\d+$/.test(amountMinor) || BigInt(amountMinor) === 0n) throw new Error("A positive payment amount is required");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) throw new Error("A payment date is required");
    if (!isHex(documentHash) || documentHash.length !== 66) throw new Error("A document hash is required");
    const authorized = await verifyMessage({
      address: issuer as Address,
      signature: signature as Hex,
      message: evidenceRequestMessage({
        issuer: issuer as Address,
        payer: payer as Address,
        periodKey,
        amountMinor,
        paidAt,
        documentHash: documentHash as Hex,
        chainId: activeChain.id,
      }),
    });
    if (!authorized) return NextResponse.json({ error: "The issuer authorization is invalid" }, { status: 401 });
    const requestId = randomUUID();
    const issuedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const unsigned = {
      status: "FOUND" as const,
      amountMinor,
      paidAt,
      payerReferenceHash: payerReferenceHash(payer as Address),
      source: counterpartySource({
        requestId,
        issuer: issuer as Address,
        periodKey,
        documentHash: documentHash as Hex,
        chainId: activeChain.id,
      }),
      issuedAt,
      expiresAt,
    };
    const record = { ...unsigned, payloadHash: hashCanonical(unsigned) as Hex };
    const paymentRequest: PaymentRequestRecord = {
      requestId,
      issuer: issuer as Address,
      payer: payer as Address,
      periodKey,
      documentHash: documentHash as Hex,
      record,
    };
    await storePaymentRequest(paymentRequest);
    return NextResponse.json({
      requestId,
      confirmationUrl: `${new URL(request.url).origin}/attest/${requestId}`,
      expiresAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create payer confirmation";
    return NextResponse.json({ error: message }, { status: message.includes("configured") ? 503 : 400 });
  }
}
