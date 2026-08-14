"use client";

import { ArrowUpRight, Building2, CircleDollarSign, Fingerprint, LoaderCircle, RefreshCw, ShieldCheck, Store, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatUnits, parseUnits, type Address, type Hex } from "viem";
import { useAccount, useConnect, useDisconnect, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { erc20Abi, marketplaceAbi } from "../../lib/abis";
import { activeChain, contracts, isMainnet, networkLabel, writesEnabled } from "../../lib/chain";
import { ThemeToggle } from "../../components/theme-toggle";

interface Offering {
  listingId: bigint;
  assetId: Hex;
  issuer: Address;
  shareToken: Address;
  pricePerShareMinor: bigint;
  availableShares: bigint;
  soldShares: bigint;
  metadataURI: string;
  active: boolean;
  name: string;
  symbol: string;
  walletBalance: bigint;
}

function short(value?: string) {
  return value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "Not connected";
}

export default function MarketplacePage() {
  const { address, chainId, isConnected } = useAccount();
  const { connectors, connect, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { writeContractAsync, isPending } = useWriteContract();
  const publicClient = usePublicClient({ chainId: activeChain.id });
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("Loading public offerings…");
  const networkReady = chainId === activeChain.id;
  const connector = connectors[0];

  const loadOfferings = useCallback(async () => {
    if (!publicClient || !contracts.marketplace) {
      setStatus("Marketplace deployment is not configured yet.");
      return;
    }
    try {
      setStatus("Reading listings from BOT Chain…");
      const count = await publicClient.readContract({ address: contracts.marketplace, abi: marketplaceAbi, functionName: "listingCount" });
      const rows = await Promise.all(Array.from({ length: Number(count) }, async (_, index) => {
        const listingId = BigInt(index + 1);
        const listing = await publicClient.readContract({ address: contracts.marketplace!, abi: marketplaceAbi, functionName: "getListing", args: [listingId] });
        const [name, symbol, walletBalance] = await Promise.all([
          publicClient.readContract({ address: listing.shareToken, abi: erc20Abi, functionName: "name" }),
          publicClient.readContract({ address: listing.shareToken, abi: erc20Abi, functionName: "symbol" }),
          address ? publicClient.readContract({ address: listing.shareToken, abi: erc20Abi, functionName: "balanceOf", args: [address] }) : Promise.resolve(0n),
        ]);
        return { listingId, ...listing, name, symbol, walletBalance } satisfies Offering;
      }));
      setOfferings(rows.reverse());
      setStatus(count === 0n ? "No issuers have listed an offering yet." : `${count} public offering${count === 1n ? "" : "s"} loaded from BOT Chain.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message.split("\n")[0] : "Could not load offerings");
    }
  }, [address, publicClient]);

  useEffect(() => { void loadOfferings(); }, [loadOfferings]);
  const portfolio = useMemo(() => offerings.filter((offering) => offering.walletBalance > 0n), [offerings]);

  async function buy(offering: Offering) {
    if (!address || !publicClient || !contracts.marketplace || !contracts.settlement) return;
    try {
      const amount = parseUnits(quantities[offering.listingId.toString()] || "0", 18);
      if (amount <= 0n) throw new Error("Enter a positive number of shares");
      if (amount > offering.availableShares) throw new Error("That quantity exceeds the available shares");
      const cost = (amount * offering.pricePerShareMinor + 10n ** 18n - 1n) / 10n ** 18n;
      const balance = await publicClient.readContract({ address: contracts.settlement, abi: erc20Abi, functionName: "balanceOf", args: [address] });
      if (balance < cost) throw new Error(`You need ${formatUnits(cost, 6)} TestUSDT. Use the faucet button first.`);
      setStatus(`Approving ${formatUnits(cost, 6)} TestUSDT…`);
      const approval = await writeContractAsync({ address: contracts.settlement, abi: erc20Abi, functionName: "approve", args: [contracts.marketplace, cost], chainId: activeChain.id });
      if ((await publicClient.waitForTransactionReceipt({ hash: approval })).status !== "success") throw new Error("TestUSDT approval reverted");
      setStatus(`Buying ${formatUnits(amount, 18)} ${offering.symbol} onchain…`);
      const purchase = await writeContractAsync({ address: contracts.marketplace, abi: marketplaceAbi, functionName: "buy", args: [offering.listingId, amount, cost], chainId: activeChain.id });
      if ((await publicClient.waitForTransactionReceipt({ hash: purchase })).status !== "success") throw new Error("Share purchase reverted");
      setStatus(`Purchase confirmed. ${formatUnits(amount, 18)} ${offering.symbol} is now in ${short(address)}.`);
      await loadOfferings();
    } catch (error) {
      setStatus(error instanceof Error ? error.message.split("\n")[0] : "Purchase failed");
    }
  }

  async function mintTestUsdt() {
    if (!address || !publicClient || !contracts.settlement || isMainnet) return;
    try {
      setStatus("Minting 10,000 public TestUSDT to your wallet…");
      const hash = await writeContractAsync({ address: contracts.settlement, abi: erc20Abi, functionName: "mint", args: [address, parseUnits("10000", 6)], chainId: activeChain.id });
      if ((await publicClient.waitForTransactionReceipt({ hash })).status !== "success") throw new Error("TestUSDT faucet transaction reverted");
      setStatus("10,000 TestUSDT received. You can now purchase a listed offering.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message.split("\n")[0] : "Faucet transaction failed");
    }
  }

  return (
    <main className="market-page">
      <nav className="nav shell">
        <a className="brand" href="/" aria-label="Veritable home"><span className="brand-mark"><Fingerprint size={19} /></span>Veritable</a>
        <div className="nav-right"><ThemeToggle /><a className="docs-link" href="/app">Protocol console <ArrowUpRight size={14} /></a>{isConnected ? <button className="wallet-button connected" onClick={() => disconnect()}><Wallet size={16} /><span>{short(address)}</span></button> : <button className="wallet-button" disabled={!connector || isConnecting} onClick={() => connector && connect({ connector })}>{isConnecting ? <LoaderCircle className="spin" size={16} /> : <Wallet size={16} />}<span>Connect wallet</span></button>}</div>
      </nav>

      <section className="market-hero shell">
        <div className="eyebrow"><Store size={15} /> Public Testnet marketplace</div>
        <h1>Own the share.<br /><span>Verify the yield.</span></h1>
        <p className="hero-copy">Browse issuer-listed RWA offerings, purchase revenue-share tokens with TestUSDT, and claim only the income Veritable verifies.</p>
        <div className="market-toolbar">
          {!isConnected ? <button className="primary-link" disabled={!connector} onClick={() => connector && connect({ connector })}><Wallet size={16} /> Connect to invest</button> : !networkReady ? <button className="primary-link" onClick={() => switchChain({ chainId: activeChain.id })}>{isSwitching ? "Switching…" : `Switch to ${networkLabel}`}</button> : !isMainnet && <button className="primary-link" disabled={isPending} onClick={() => void mintTestUsdt()}><CircleDollarSign size={16} /> Get 10,000 TestUSDT</button>}
          <button className="secondary-link" onClick={() => void loadOfferings()}><RefreshCw size={15} /> Refresh listings</button>
        </div>
        <p className="market-disclaimer"><ShieldCheck size={14} /> Testnet sandbox only. Listings are public onchain primary issuances, not legal securities offerings or secondary-market trading.</p>
      </section>

      <section className="market-content shell">
        <div className="section-heading"><div><span className="kicker">Open inventory</span><h2>Property offerings</h2></div><p>Every purchase settles wallet-to-contract on BOT Chain.</p></div>
        <div className="offering-grid">
          {offerings.map((offering) => <article className="offering-card" key={offering.listingId.toString()}>
            <div className="offering-top"><span className={offering.active ? "live" : "sold"}>{offering.active ? "LIVE" : "CLOSED"}</span><small>LISTING #{offering.listingId.toString()}</small></div>
            <Building2 size={27} />
            <h3>{offering.name}</h3>
            <p>{offering.metadataURI || "Issuer-registered rental-income asset"}</p>
            <dl><div><dt>Price / share</dt><dd>{formatUnits(offering.pricePerShareMinor, 6)} USDT</dd></div><div><dt>Available</dt><dd>{formatUnits(offering.availableShares, 18)} {offering.symbol}</dd></div><div><dt>Already sold</dt><dd>{formatUnits(offering.soldShares, 18)} {offering.symbol}</dd></div><div><dt>Issuer</dt><dd>{short(offering.issuer)}</dd></div></dl>
            {offering.walletBalance > 0n && <div className="owned-badge">You own {formatUnits(offering.walletBalance, 18)} {offering.symbol}</div>}
            {offering.active && <div className="invest-row"><input aria-label={`Shares of ${offering.name}`} type="number" min="0.000001" step="0.000001" placeholder="Shares" value={quantities[offering.listingId.toString()] || ""} onChange={(event) => setQuantities((current) => ({ ...current, [offering.listingId.toString()]: event.target.value }))} /><button disabled={!isConnected || !networkReady || !writesEnabled || isPending} onClick={() => void buy(offering)}>Invest</button></div>}
            <a className="chain-link" href={`${activeChain.blockExplorers.default.url}/address/${offering.shareToken}`} target="_blank" rel="noreferrer">View share token <ArrowUpRight size={13} /></a>
          </article>)}
          {offerings.length === 0 && <div className="empty-market"><Store /><h3>Waiting for the first listing</h3><p>An issuer can create an asset and list escrowed shares from the protocol console.</p><a href="/app#console">Open issuer console</a></div>}
        </div>
      </section>

      <section className="portfolio shell">
        <div className="section-heading"><div><span className="kicker">Connected wallet</span><h2>Your investor portfolio</h2></div><a className="secondary-link" href="/app#console">Claim verified proceeds <ArrowUpRight size={14} /></a></div>
        {!isConnected ? <p>Connect a wallet to see share-token holdings.</p> : portfolio.length === 0 ? <p>No marketplace share holdings found for {short(address)}.</p> : <div className="portfolio-grid">{portfolio.map((offering) => <div key={offering.listingId.toString()}><strong>{offering.name}</strong><span>{formatUnits(offering.walletBalance, 18)} {offering.symbol}</span><small>{short(offering.shareToken)}</small></div>)}</div>}
      </section>
      <div className="market-status"><span />{status}</div>
    </main>
  );
}
