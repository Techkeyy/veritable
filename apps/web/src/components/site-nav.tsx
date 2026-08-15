"use client";

import { Fingerprint, LoaderCircle, Wallet } from "lucide-react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { compactId } from "../lib/format";

export function SiteNav({ active }: { active?: "market" | "issue" | "track" }) {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const connector = connectors[0];

  return (
    <nav className="nav shell product-nav">
      <a className="brand" href="/" aria-label="Veritable home">
        <span className="brand-mark"><Fingerprint size={19} /></span>
        Veritable
      </a>
      <div className="product-links" aria-label="Primary">
        <a className={active === "market" ? "active" : ""} href="/marketplace">Invest</a>
        <a className={active === "issue" ? "active" : ""} href="/app">Report rent</a>
        <a className={active === "track" ? "active" : ""} href="/app?mode=track">Track a claim</a>
      </div>
      <div className="nav-right">
        {isConnected ? (
          <button className="wallet-button connected" aria-label={`Disconnect wallet ${compactId(address)}`} onClick={() => disconnect()}>
            <Wallet size={16} /><span>{compactId(address)}</span>
          </button>
        ) : (
          <button className="wallet-button" disabled={!connector || isPending} onClick={() => connector && connect({ connector })}>
            {isPending ? <LoaderCircle className="spin" size={16} /> : <Wallet size={16} />}
            <span>{isPending ? "Connecting" : "Connect wallet"}</span>
          </button>
        )}
      </div>
    </nav>
  );
}
