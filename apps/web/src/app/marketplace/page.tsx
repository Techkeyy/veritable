"use client";

import { ArrowUpRight, Building2, CircleDollarSign, LoaderCircle, RefreshCw, ShieldCheck, Store } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { parseUnits, type Address, type Hex } from "viem";
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { SiteNav } from "../../components/site-nav";
import { erc20Abi, marketplaceAbi } from "../../lib/abis";
import { activeChain, contracts, isMainnet, networkLabel, writesEnabled } from "../../lib/chain";
import { compactId, formatAmount, formatShares } from "../../lib/format";

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

function listingCost(shares: bigint, pricePerShareMinor: bigint) {
  return (shares * pricePerShareMinor + 10n ** 18n - 1n) / 10n ** 18n;
}

export default function MarketplacePage() {
  const { address, chainId, isConnected } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { writeContractAsync, isPending } = useWriteContract();
  const publicClient = usePublicClient({ chainId: activeChain.id });
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("Loading public offerings…");
  const networkReady = chainId === activeChain.id;

  const loadOfferings = useCallback(async () => {
    if (!publicClient || !contracts.marketplace) {
      setStatus("Marketplace deployment is not configured yet.");
      return;
    }
    try {
      setStatus("Reading listings from BOT Chain…");
      const count = await publicClient.readContract({
        address: contracts.marketplace,
        abi: marketplaceAbi,
        functionName: "listingCount",
      });
      const rows = await Promise.all(Array.from({ length: Number(count) }, async (_, index) => {
        const listingId = BigInt(index + 1);
        const listing = await publicClient.readContract({
          address: contracts.marketplace!,
          abi: marketplaceAbi,
          functionName: "getListing",
          args: [listingId],
        });
        const [name, symbol, walletBalance] = await Promise.all([
          publicClient.readContract({ address: listing.shareToken, abi: erc20Abi, functionName: "name" }),
          publicClient.readContract({ address: listing.shareToken, abi: erc20Abi, functionName: "symbol" }),
          address
            ? publicClient.readContract({ address: listing.shareToken, abi: erc20Abi, functionName: "balanceOf", args: [address] })
            : Promise.resolve(0n),
        ]);
        return { listingId, ...listing, name, symbol, walletBalance } satisfies Offering;
      }));
      setOfferings(rows.reverse());
      setQuantities((current) => {
        const next = { ...current };
        for (const offering of rows) {
          const key = offering.listingId.toString();
          if (!next[key]) next[key] = "1";
        }
        return next;
      });
      setStatus(count === 0n ? "No public offerings yet." : `${count} public offering${count === 1n ? "" : "s"} loaded.`);
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
      const cost = listingCost(amount, offering.pricePerShareMinor);
      const balance = await publicClient.readContract({
        address: contracts.settlement,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      });
      if (balance < cost) throw new Error(`You need ${formatAmount(cost)} TestUSDT. Get TestUSDT first.`);
      setStatus(`Approving ${formatAmount(cost)} TestUSDT…`);
      const approval = await writeContractAsync({
        address: contracts.settlement,
        abi: erc20Abi,
        functionName: "approve",
        args: [contracts.marketplace, cost],
        chainId: activeChain.id,
      });
      if ((await publicClient.waitForTransactionReceipt({ hash: approval })).status !== "success") {
        throw new Error("TestUSDT approval reverted");
      }
      setStatus(`Buying ${formatShares(amount)} ${offering.symbol}…`);
      const purchase = await writeContractAsync({
        address: contracts.marketplace,
        abi: marketplaceAbi,
        functionName: "buy",
        args: [offering.listingId, amount, cost],
        chainId: activeChain.id,
      });
      if ((await publicClient.waitForTransactionReceipt({ hash: purchase })).status !== "success") {
        throw new Error("Share purchase reverted");
      }
      setStatus(`You own ${formatShares(amount)} ${offering.symbol}. When this property reports verified rent, claim it from Track a claim.`);
      await loadOfferings();
    } catch (error) {
      setStatus(error instanceof Error ? error.message.split("\n")[0] : "Purchase failed");
    }
  }

  async function mintTestUsdt() {
    if (!address || !publicClient || !contracts.settlement || isMainnet) return;
    try {
      setStatus("Minting 10,000 public TestUSDT to your wallet…");
      const hash = await writeContractAsync({
        address: contracts.settlement,
        abi: erc20Abi,
        functionName: "mint",
        args: [address, parseUnits("10000", 6)],
        chainId: activeChain.id,
      });
      if ((await publicClient.waitForTransactionReceipt({ hash })).status !== "success") {
        throw new Error("TestUSDT faucet transaction reverted");
      }
      setStatus("10,000 TestUSDT received. You can now purchase a listed offering.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message.split("\n")[0] : "Faucet transaction failed");
    }
  }

  return (
    <main className="market-page">
      <SiteNav active="market" />

      <section className="market-hero shell">
        <div className="eyebrow"><Store size={15} /> Public Testnet marketplace</div>
        <h1>Own the share.<br /><span>Verify the yield.</span></h1>
        <p className="hero-copy">Buy revenue-share tokens with TestUSDT. You only collect income after Veritable verifies the rent.</p>
        <div className="market-toolbar">
          {!isConnected ? (
            <p className="hero-copy">Connect a wallet in the header to invest.</p>
          ) : !networkReady ? (
            <button className="primary-link" onClick={() => switchChain({ chainId: activeChain.id })}>
              {isSwitching ? "Switching…" : `Switch to ${networkLabel}`}
            </button>
          ) : !isMainnet && (
            <button className="primary-link" disabled={isPending} onClick={() => void mintTestUsdt()}>
              {isPending ? <LoaderCircle className="spin" size={16} /> : <CircleDollarSign size={16} />} Get 10,000 TestUSDT
            </button>
          )}
          <button className="secondary-link" onClick={() => void loadOfferings()}><RefreshCw size={15} /> Refresh listings</button>
        </div>
        <p className="market-disclaimer"><ShieldCheck size={14} /> Testnet sandbox only. These are public onchain primary issuances, not legal securities or a secondary market.</p>
      </section>

      <section className="market-content shell">
        <div className="section-heading">
          <div><span className="kicker">Open inventory</span><h2>Property offerings</h2></div>
          <p>Every purchase settles wallet-to-contract on BOT Chain.</p>
        </div>
        <div className="offering-grid">
          {offerings.map((offering) => {
            const key = offering.listingId.toString();
            let costLabel = "";
            try {
              const shares = parseUnits(quantities[key] || "0", 18);
              if (shares > 0n) costLabel = `${formatShares(shares)} shares · ${formatAmount(listingCost(shares, offering.pricePerShareMinor))} TestUSDT`;
            } catch {
              costLabel = "";
            }
            return (
              <article className="offering-card" key={key}>
                <div className="offering-top">
                  <span className={offering.active ? "live" : "sold"}>{offering.active ? "LIVE" : "CLOSED"}</span>
                  <small>{offering.symbol}</small>
                </div>
                <Building2 size={27} />
                <h3>{offering.name}</h3>
                <p>{offering.metadataURI || "Issuer-registered rental-income asset"}</p>
                <dl>
                  <div><dt>Price / share</dt><dd>{formatAmount(offering.pricePerShareMinor)} USDT</dd></div>
                  <div><dt>Available</dt><dd>{formatShares(offering.availableShares)} {offering.symbol}</dd></div>
                  <div><dt>Already sold</dt><dd>{formatShares(offering.soldShares)} {offering.symbol}</dd></div>
                  <div><dt>Issuer</dt><dd>{compactId(offering.issuer)}</dd></div>
                </dl>
                {offering.walletBalance > 0n && (
                  <div className="owned-badge">You own {formatShares(offering.walletBalance)} {offering.symbol}</div>
                )}
                {offering.active && (
                  <>
                    <div className="invest-row">
                      <input
                        aria-label={`Shares of ${offering.name}`}
                        type="number"
                        min="0.000001"
                        step="0.000001"
                        placeholder="Shares"
                        value={quantities[key] || ""}
                        onChange={(event) => setQuantities((current) => ({ ...current, [key]: event.target.value }))}
                      />
                      <button disabled={!isConnected || !networkReady || !writesEnabled || isPending} onClick={() => void buy(offering)}>
                        Invest
                      </button>
                    </div>
                    {costLabel && <p className="cost-line">{costLabel}</p>}
                  </>
                )}
                <a className="chain-link" href={`${activeChain.blockExplorers.default.url}/address/${offering.shareToken}`} target="_blank" rel="noreferrer">
                  View share token <ArrowUpRight size={13} />
                </a>
              </article>
            );
          })}
          {offerings.length === 0 && (
            <div className="empty-market">
              <Store />
              <h3>No listings yet</h3>
              <p>Report rent to create a property, then offer shares from Track a claim.</p>
              <a href="/app">Report rent</a>
            </div>
          )}
        </div>
      </section>

      <section className="portfolio shell">
        <div className="section-heading">
          <div><span className="kicker">Connected wallet</span><h2>Your holdings</h2></div>
          <a className="secondary-link" href="/app?mode=track">Track a claim <ArrowUpRight size={14} /></a>
        </div>
        {!isConnected ? (
          <p>Connect a wallet to see share holdings.</p>
        ) : portfolio.length === 0 ? (
          <p>No marketplace holdings for {compactId(address)}.</p>
        ) : (
          <div className="portfolio-grid">
            {portfolio.map((offering) => (
              <div key={offering.listingId.toString()}>
                <strong>{offering.name}</strong>
                <span>{formatShares(offering.walletBalance)} {offering.symbol}</span>
                <small>Claim verified rent from Track a claim.</small>
              </div>
            ))}
          </div>
        )}
      </section>
      <div className="market-status"><span />{status}</div>
    </main>
  );
}
