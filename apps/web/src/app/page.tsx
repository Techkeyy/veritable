import {
  ArrowUpRight,
  Bot,
  CircleDollarSign,
  FileCheck2,
  Fingerprint,
  ShieldCheck,
} from "lucide-react";

export default function LandingPage() {
  return (
    <main className="landing-page">
      <nav className="nav shell">
        <a className="brand" href="/" aria-label="Veritable home">
          <span className="brand-mark"><Fingerprint size={19} /></span>
          Veritable
        </a>
        <div className="nav-right">
          <a className="docs-link" href="https://docs.botchain.ai" target="_blank" rel="noreferrer">
            BOT docs <ArrowUpRight size={14} />
          </a>
          <a className="wallet-button launch-button" href="/app">
            Launch app <ArrowUpRight size={16} />
          </a>
        </div>
      </nav>

      <section className="hero shell" id="top">
        <div className="eyebrow"><ShieldCheck size={15} /> Built for the AI × RWA challenge</div>
        <h1>Make real-world yield<br /><span>prove itself.</span></h1>
        <p className="hero-copy">
          Veritable turns messy payment evidence into deterministic, challengeable
          onchain settlement—without letting an AI decide who gets paid.
        </p>
        <div className="hero-actions">
          <a className="primary-link" href="/marketplace">Explore properties <ArrowUpRight size={17} /></a>
          <a className="secondary-link" href="/app">Open protocol console</a>
        </div>
        <div className="proof-strip">
          <div><strong>AI extracts</strong><span>Documents become structured facts</span></div>
          <div><strong>Policy decides</strong><span>Versioned rules reproduce outcomes</span></div>
          <div><strong>BOT settles</strong><span>Bonds and disputes create accountability</span></div>
        </div>
      </section>

      <section className="trust shell" id="how">
        <div className="section-heading">
          <div>
            <span className="kicker">The trust boundary</span>
            <h2>Intelligence without authority</h2>
          </div>
          <p>AI does the ambiguous work. Transparent code makes the consequential decision.</p>
        </div>
        <div className="trust-grid">
          <article>
            <span className="step">01</span><Bot />
            <h3>Extract</h3>
            <p>DeepSeek turns authorized source documents into typed, cited facts. Inputs and outputs are hash-committed.</p>
            <small>Source-bound · auditable</small>
          </article>
          <article>
            <span className="step">02</span><FileCheck2 />
            <h3>Evaluate</h3>
            <p>A deterministic policy checks signatures, payer identity, dates, and amounts. The same facts always produce the same result.</p>
            <small>Reproducible · versioned</small>
          </article>
          <article>
            <span className="step">03</span><ShieldCheck />
            <h3>Attest</h3>
            <p>A bonded verifier signs the report. Anyone can challenge it before settlement; false approvals put stake at risk.</p>
            <small>Accountable · challengeable</small>
          </article>
          <article>
            <span className="step">04</span><CircleDollarSign />
            <h3>Settle</h3>
            <p>Verified escrow becomes claimable by the exact token-holder snapshot, without retroactive entitlement changes.</p>
            <small>Onchain · pull-based</small>
          </article>
        </div>
      </section>

      <footer className="shell">
        <a className="brand" href="/"><span className="brand-mark"><Fingerprint size={18} /></span>Veritable</a>
        <p>Verifiable revenue rails for tokenized real-world assets.</p>
        <span>Testnet prototype · not financial advice</span>
      </footer>
    </main>
  );
}
