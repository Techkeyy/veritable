import { ArrowUpRight, Bot, CircleDollarSign, Fingerprint, Gavel } from "lucide-react";
import { ScrollReveal } from "../components/scroll-reveal";

export default function LandingPage() {
  return (
    <main className="landing-page ballroom-landing">
      <section className="cinematic-hero" id="top">
        <img className="cinematic-hero-image" src="/veritable-hero.jpg" alt="" aria-hidden="true" />
        <div className="cinematic-hero-shade" />
        <nav className="nav shell cinematic-nav">
          <a className="brand cinematic-brand" href="/" aria-label="Veritable home">
            <span className="brand-mark"><Fingerprint size={19} /></span>
            Veritable
          </a>
          <div className="nav-right">
            <a className="cinematic-launch" href="/app">Report this month’s income <ArrowUpRight size={15} /></a>
          </div>
        </nav>

        <div className="cinematic-hero-content shell">
          <h1 className="cinematic-title">VERITABLE</h1>
          <p className="cinematic-lede">Make real-world yield prove itself. Turn payment evidence into deterministic, challengeable settlement, not another promise investors must trust.</p>
          <div className="cinematic-actions">
            <a className="cinematic-primary" href="/marketplace">Explore properties <ArrowUpRight size={15} /></a>
            <a className="cinematic-secondary" href="/app">Report this month’s income</a>
          </div>
        </div>

      </section>

      <section className="cinematic-entry" id="enter">
        <div className="cinematic-section-grid shell">
          <div className="cinematic-section-copy">
            <p className="cinematic-kicker">Choose a job</p>
            <ScrollReveal as="h2" className="cinematic-editorial-heading">One wallet. Every role. One verifiable rail.</ScrollReveal>
            <p className="cinematic-body">Buy a share, report this month’s income, or read the verdict. Try it: sample document, send a test payment, wait the window, claim.</p>
          </div>

          <div className="cinematic-entry-card">
            <p className="cinematic-card-label">Choose your side</p>
            <p className="cinematic-card-intro">Move directly to the surface built for what you came to do.</p>
            <div className="cinematic-role-links">
              <a href="/marketplace"><span>Investor</span><strong>Browse public offerings</strong><ArrowUpRight /></a>
              <a href="/app"><span>Issuer</span><strong>Report this month’s income</strong><ArrowUpRight /></a>
              <a href="/app?mode=track"><span>Public</span><strong>Track a claim</strong><ArrowUpRight /></a>
            </div>
            <p className="cinematic-card-note">One wallet identity · no custodial account · Testnet today</p>
          </div>
        </div>
      </section>

      <section className="cinematic-how" id="how">
        <div className="shell">
          <p className="cinematic-kicker">How Veritable works</p>
          <ScrollReveal as="h2" className="cinematic-editorial-heading cinematic-how-heading">Three moves. One accountable outcome.</ScrollReveal>
          <div className="cinematic-steps">
            <article><span>01</span><Bot /><h3>Bring the proof</h3><p>DeepSeek extracts cited facts from authorized records while a BOT payment or payer signature independently proves the money moved.</p></article>
            <article><span>02</span><Gavel /><h3>Make truth contestable</h3><p>Deterministic rules reproduce the verdict. A bonded verifier attests it, and anyone can challenge a false approval.</p></article>
            <article><span>03</span><CircleDollarSign /><h3>Release verified yield</h3><p>Only settled escrow becomes claimable by the exact share-holder snapshot. Every payout leaves an onchain receipt.</p></article>
          </div>
        </div>
      </section>

      <footer className="cinematic-footer">
        <div className="shell"><strong>Veritable</strong><span>Verifiable revenue · public proof · BOT Chain</span><div><a href="/marketplace">Marketplace</a><a href="/app">Report income</a><a href="https://github.com/Techkeyy/veritable" target="_blank" rel="noreferrer">GitHub</a></div></div>
      </footer>
    </main>
  );
}
