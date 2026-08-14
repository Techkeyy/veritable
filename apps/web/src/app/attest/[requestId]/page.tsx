"use client";

import { CheckCircle2, Fingerprint, LoaderCircle, ShieldCheck, Wallet } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { formatUnits, type Address, type Hex } from "viem";
import { useAccount, useConnect, useSignMessage } from "wagmi";

interface ConfirmationRequest {
  requestId: string;
  issuer: Address;
  payer: Address;
  periodKey: string;
  documentHash: Hex;
  record: { amountMinor: string; paidAt: string; source: string; expiresAt: string; payloadHash: Hex };
  status: "PENDING" | "CONFIRMED";
  error?: string;
}

function short(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export default function PayerConfirmationPage() {
  const params = useParams<{ requestId: string }>();
  const requestId = String(params.requestId || "");
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending: isConnecting } = useConnect();
  const { signMessageAsync } = useSignMessage();
  const [request, setRequest] = useState<ConfirmationRequest>();
  const [status, setStatus] = useState("Loading confirmation request…");
  const [isConfirming, setIsConfirming] = useState(false);
  const connector = connectors[0];
  const payerMatches = useMemo(
    () => Boolean(address && request && address.toLowerCase() === request.payer.toLowerCase()),
    [address, request],
  );

  useEffect(() => {
    if (!requestId) return;
    void fetch(`/v1/evidence/requests/${requestId}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as ConfirmationRequest;
        if (!response.ok) throw new Error(body.error || "Confirmation request not found");
        setRequest(body);
        setStatus(body.status === "CONFIRMED" ? "Payment already confirmed." : "Review the details and confirm with the registered payer wallet.");
      })
      .catch((error: unknown) => setStatus(error instanceof Error ? error.message : "Could not load confirmation request"));
  }, [requestId]);

  async function confirmPayment() {
    if (!request || !address || !payerMatches) return;
    try {
      setIsConfirming(true);
      setStatus("Confirm the payment receipt in your wallet…");
      const signature = await signMessageAsync({ message: { raw: request.record.payloadHash } });
      const response = await fetch(`/v1/evidence/requests/${requestId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payer: address, signature }),
      });
      const body = await response.json() as ConfirmationRequest;
      if (!response.ok) throw new Error(body.error || "Payment confirmation failed");
      setRequest(body);
      setStatus("Payment confirmed. The issuer can now continue in Veritable.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Payment confirmation failed");
    } finally {
      setIsConfirming(false);
    }
  }

  return (
    <main className="attest-page">
      <nav className="nav shell">
        <a className="brand" href="/" aria-label="Veritable home"><span className="brand-mark"><Fingerprint size={19} /></span>Veritable</a>
        <div className="nav-right">
          {!isConnected && <button className="wallet-button" disabled={!connector || isConnecting} onClick={() => connector && connect({ connector })}>
            {isConnecting ? <LoaderCircle className="spin" size={16} /> : <Wallet size={16} />}<span>Connect payer wallet</span>
          </button>}
        </div>
      </nav>
      <section className="attest-shell shell">
        <div className="eyebrow"><ShieldCheck size={15} /> Counterparty payment confirmation</div>
        <h1>Review. Sign.<br /><span>Done.</span></h1>
        <p className="hero-copy">Your signature confirms the payment facts below. It does not authorize a token transfer or expose bank credentials.</p>
        <div className="attest-card">
          {request ? (
            <>
              <div className="attest-status"><span className={request.status === "CONFIRMED" ? "confirmed" : ""} />{request.status}</div>
              <dl>
                <div><dt>Amount</dt><dd>{formatUnits(BigInt(request.record.amountMinor), 6)} USDT</dd></div>
                <div><dt>Payment date</dt><dd>{request.record.paidAt}</dd></div>
                <div><dt>Revenue period</dt><dd>{request.periodKey}</dd></div>
                <div><dt>Issuer</dt><dd>{short(request.issuer)}</dd></div>
                <div><dt>Registered payer</dt><dd>{short(request.payer)}</dd></div>
                <div><dt>Document commitment</dt><dd>{short(request.documentHash)}</dd></div>
              </dl>
              {request.status === "CONFIRMED" ? (
                <div className="confirmation-complete"><CheckCircle2 /> Payment confirmed</div>
              ) : !isConnected ? (
                <p className="attest-help">Connect the registered payer wallet to continue.</p>
              ) : !payerMatches ? (
                <p className="attest-error">This request must be signed by {short(request.payer)}, not {short(address!)}.</p>
              ) : (
                <button className="submit" disabled={isConfirming} onClick={() => void confirmPayment()}>
                  {isConfirming ? <LoaderCircle className="spin" /> : <ShieldCheck />} Confirm payment
                </button>
              )}
            </>
          ) : <div className="attest-loading"><LoaderCircle className="spin" /> Loading request</div>}
          <p className="status-line">{status}</p>
        </div>
      </section>
    </main>
  );
}
