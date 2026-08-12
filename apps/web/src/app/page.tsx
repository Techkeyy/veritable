"use client";

import {
  ArrowUpRight,
  Building2,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  FileCheck2,
  SearchCheck,
  Scale,
  Fingerprint,
  Gavel,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  Unplug,
  Wallet,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { getAddress, isAddress, isHex, keccak256, parseEther, parseUnits, stringToHex } from "viem";
import {
  useAccount,
  useConnect,
  useDisconnect,
  usePublicClient,
  useSignMessage,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { assetFactoryAbi, attestationAbi, erc20Abi, stakingAbi, vaultAbi } from "../lib/abis";
import { botTestnet, contracts, isConfigured } from "../lib/chain";
import { attestationRequestMessage } from "../lib/attestationRequest";
import { hashCanonical } from "@veritable/policy";

type Action = "asset" | "claim" | "inspect" | "collect" | "stake" | "challenge" | "resolve";

interface PublicReport {
  reportHash: string;
  attestationId?: string;
  attestationTransactionHash?: string;
  report: {
    claimId: string;
    outcome: "VERIFIED" | "BLOCKED" | "INCONCLUSIVE";
    periodKey: string;
    verifiedAmountMinor: string;
    policyVersion: string;
    ruleResults: Array<{ ruleId: string; status: "PASS" | "FAIL" | "UNKNOWN"; message: string }>;
    limitations: string[];
  };
}

interface ProcessResult {
  status: "SUBMITTED" | "ALREADY_SUBMITTED" | "INCONCLUSIVE";
  outcome: "VERIFIED" | "BLOCKED" | "INCONCLUSIVE";
  reportHash: string;
}

const scenarios = [
  { value: "rent-paid-exact", label: "Exact payment", detail: "Oracle amount and payer match the claim." },
  { value: "rent-underpaid", label: "Underpayment", detail: "Useful for demonstrating a blocked release." },
  { value: "unavailable", label: "Oracle unavailable", detail: "Produces INCONCLUSIVE; nothing settles." },
];

const evidenceLabels: Record<string, string> = {
  "rent-paid-exact": "evidence:exact-payment",
  "rent-underpaid": "evidence:underpaid",
  unavailable: "evidence:unavailable",
};

const PUBLIC_DEMO_CLAIM_ID = "0xd4cf42cb6f65510f1500ffdad7e41a23fac339c509f0e0527bc49f47eaff00e3";

const demoTerms = {
  expectedAmountMinor: "2000000000",
  dueDate: "2026-08-01",
  windowDays: 5,
  amountToleranceMinor: "0",
  payerReferenceHash: `0x${"33".repeat(32)}`,
} as const;

function short(value?: string) {
  return value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "Not connected";
}

function bytes32(value: string) {
  if (isHex(value, { strict: true }) && value.length === 66) return value as `0x${string}`;
  return keccak256(stringToHex(value));
}

export default function Home() {
  const { address, chainId, isConnected } = useAccount();
  const { connectors, connect, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { writeContractAsync, data: transactionHash, isPending } = useWriteContract();
  const { signMessageAsync } = useSignMessage();
  const publicClient = usePublicClient({ chainId: botTestnet.id });
  const receipt = useWaitForTransactionReceipt({ hash: transactionHash });
  const [active, setActive] = useState<Action>("asset");
  const [status, setStatus] = useState("Ready for a testnet action.");
  const [publicReport, setPublicReport] = useState<PublicReport>();
  const [lastClaimId, setLastClaimId] = useState<string>(PUBLIC_DEMO_CLAIM_ID);

  const networkReady = chainId === botTestnet.id;
  const canWrite = isConnected && networkReady && isConfigured;
  const txUrl = transactionHash ? `${botTestnet.blockExplorers.default.url}/tx/${transactionHash}` : undefined;
  const walletLabel = useMemo(() => short(address), [address]);

  async function safelyRun(
    action: (event: FormEvent<HTMLFormElement>) => Promise<void>,
    event: FormEvent<HTMLFormElement>,
  ) {
    try {
      await action(event);
    } catch (error) {
      const detail = error instanceof Error ? error.message.split("\n")[0] : "The action could not be completed.";
      setStatus(detail);
    }
  }

  async function submitClaim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!contracts.vault || !contracts.settlement || !address || !publicClient) return;
    const form = new FormData(event.currentTarget);
    const assetId = bytes32(String(form.get("assetId")));
    const periodKey = bytes32(String(form.get("periodKey")));
    const scenario = String(form.get("scenario"));
    const amount = parseUnits(String(form.get("amount")), 6);
    const evidenceRoot = keccak256(stringToHex(evidenceLabels[scenario] ?? "evidence:unavailable"));
    const balance = await publicClient.readContract({
      address: contracts.settlement,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    });
    if (balance < amount) {
      setStatus("Minting sandbox USDT for this BOT Testnet claim...");
      const mintHash = await writeContractAsync({
        address: contracts.settlement,
        abi: erc20Abi,
        functionName: "mint",
        args: [address, amount - balance],
        chainId: botTestnet.id,
      });
      const mintReceipt = await publicClient.waitForTransactionReceipt({ hash: mintHash });
      if (mintReceipt.status !== "success") throw new Error("Sandbox USDT mint reverted");
    }
    setStatus("Approving test USDT escrow…");
    const approvalHash = await writeContractAsync({
      address: contracts.settlement,
      abi: erc20Abi,
      functionName: "approve",
      args: [contracts.vault, amount],
      chainId: botTestnet.id,
    });
    setStatus(`Approval submitted ${short(approvalHash)}. Waiting for confirmation…`);
    const approvalReceipt = await publicClient.waitForTransactionReceipt({ hash: approvalHash });
    if (approvalReceipt.status !== "success") throw new Error("Settlement-token approval reverted");
    setStatus("Approval confirmed. Submitting the escrowed claim…");
    const claimHash = await writeContractAsync({
      address: contracts.vault,
      abi: vaultAbi,
      functionName: "submitClaim",
      args: [assetId, periodKey, amount, evidenceRoot],
      chainId: botTestnet.id,
    });
    const claimReceipt = await publicClient.waitForTransactionReceipt({ hash: claimHash });
    if (claimReceipt.status !== "success") throw new Error("Yield claim transaction reverted");
    const claimId = await publicClient.readContract({
      address: contracts.vault,
      abi: vaultAbi,
      functionName: "periodClaims",
      args: [assetId, periodKey],
    });
    setLastClaimId(claimId);
    setStatus(`Claim ${short(claimId)} escrowed. Sign once to authorize its bonded verification.`);
    const signature = await signMessageAsync({ message: attestationRequestMessage(claimId) });
    const response = await fetch(`/v1/process/${claimId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requester: address, signature }),
    });
    if (!response.ok) throw new Error(`Verifier service returned ${response.status}`);
    const result = await response.json() as ProcessResult;
    const reportResponse = await fetch(`/v1/reports/${claimId}`);
    if (reportResponse.ok) setPublicReport(await reportResponse.json() as PublicReport);
    setActive("inspect");
    setStatus(result.status === "INCONCLUSIVE"
      ? `Claim ${short(claimId)} is inconclusive; no onchain attestation was submitted.`
      : `Claim ${short(claimId)} was attested as ${result.outcome}. The 60-second challenge window is open.`);
  }

  async function runSimple(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (active === "asset" && contracts.assetFactory && address) {
      const holderA = String(form.get("holderA") || address);
      const holderB = String(form.get("holderB") || address);
      if (!isAddress(holderA) || !isAddress(holderB)) throw new Error("Both holder addresses must be valid EVM addresses");
      const hash = await writeContractAsync({
        address: contracts.assetFactory,
        abi: assetFactoryAbi,
        functionName: "createAsset",
        args: [
          bytes32(String(form.get("newAssetId"))),
          String(form.get("tokenName")),
          String(form.get("tokenSymbol")),
          bytes32("policy-v1"),
          hashCanonical(demoTerms) as `0x${string}`,
          [getAddress(holderA), getAddress(holderB)],
          [parseUnits(String(form.get("holderAShares")), 18), parseUnits(String(form.get("holderBShares")), 18)],
        ],
        chainId: botTestnet.id,
      });
      if (!publicClient) throw new Error("BOT Testnet RPC client is unavailable");
      const creationReceipt = await publicClient.waitForTransactionReceipt({ hash });
      if (creationReceipt.status !== "success") throw new Error("Asset creation reverted");
      setStatus("Asset created and shares allocated. Continue to Submit yield using the same Asset ID.");
      return;
    }
    if (active === "inspect") {
      setPublicReport(undefined);
      setStatus("Loading the redacted deterministic report…");
      const claimId = bytes32(String(form.get("reportClaimId")));
      setLastClaimId(claimId);
      const apiBase = process.env.NEXT_PUBLIC_API_URL || window.location.origin;
      const response = await fetch(new URL(`/v1/reports/${claimId}`, apiBase));
      if (!response.ok) {
        setStatus(response.status === 404 ? "No report has been produced for that claim yet." : `Report service returned ${response.status}.`);
        return;
      }
      setPublicReport(await response.json() as PublicReport);
      setStatus("Verification report loaded from the agent's public audit trail.");
      return;
    }
    if (active === "collect" && contracts.vault) {
      await writeContractAsync({ address: contracts.vault, abi: vaultAbi, functionName: "claimYield", args: [bytes32(String(form.get("claimId")))], chainId: botTestnet.id });
      setStatus("Distribution claim submitted against the immutable holder snapshot.");
    }
    if (active === "stake" && contracts.staking) {
      await writeContractAsync({ address: contracts.staking, abi: stakingAbi, functionName: "stake", value: parseEther(String(form.get("stakeAmount"))), chainId: botTestnet.id });
      setStatus("Verifier stake submitted. Stake becomes slashable when an attestation locks it.");
    }
    if (active === "challenge" && contracts.attestation) {
      await writeContractAsync({
        address: contracts.attestation,
        abi: attestationAbi,
        functionName: "challenge",
        args: [bytes32(String(form.get("attestationId"))), bytes32(String(form.get("counterEvidence")))],
        value: parseEther("0.25"),
        chainId: botTestnet.id,
      });
      setStatus("Challenge submitted with a 0.25 tBOT bond for resolver review.");
    }
    if (active === "resolve" && contracts.attestation) {
      const attestationId = bytes32(String(form.get("resolutionAttestationId")));
      const mode = String(form.get("resolutionMode"));
      if (mode === "settle") {
        await writeContractAsync({ address: contracts.attestation, abi: attestationAbi, functionName: "settle", args: [attestationId], chainId: botTestnet.id });
        setStatus("Unchallenged attestation settlement submitted after its challenge window.");
      } else {
        await writeContractAsync({ address: contracts.attestation, abi: attestationAbi, functionName: "resolve", args: [attestationId, false, 2, 0n], chainId: botTestnet.id });
        setStatus("Resolver reversal submitted: claim blocked, verifier stake slashed, challenger bond returned.");
      }
    }
  }

  const connector = connectors[0];
  return (
    <main>
      <nav className="nav shell">
        <a className="brand" href="#top" aria-label="VeriFi home"><span className="brand-mark"><Fingerprint size={19} /></span>VeriFi</a>
        <div className="nav-right">
          <a className="docs-link" href="https://docs.botchain.ai" target="_blank" rel="noreferrer">BOT docs <ArrowUpRight size={14} /></a>
          <span className="network-pill"><span /> BOT Testnet · 968</span>
          {isConnected ? (
            <button className="wallet-button connected" onClick={() => disconnect()}><Wallet size={16} /> {walletLabel}</button>
          ) : (
            <button className="wallet-button" disabled={!connector || isConnecting} onClick={() => connector && connect({ connector })}>
              {isConnecting ? <LoaderCircle className="spin" size={16} /> : <Wallet size={16} />} Connect wallet
            </button>
          )}
        </div>
      </nav>

      <section className="hero shell" id="top">
        <div className="eyebrow"><ShieldCheck size={15} /> Built for the AI × RWA challenge</div>
        <h1>Make real-world yield<br /><span>prove itself.</span></h1>
        <p className="hero-copy">VeriFi turns messy payment evidence into deterministic, challengeable onchain settlement—without letting an AI decide who gets paid.</p>
        <div className="hero-actions">
          <a className="primary-link" href="#console">Open testnet console <ArrowUpRight size={17} /></a>
          <a className="secondary-link" href="#how">See the trust model</a>
        </div>
        <div className="proof-strip">
          <div><strong>AI extracts</strong><span>Documents become structured facts</span></div>
          <div><strong>Policy decides</strong><span>Versioned rules reproduce outcomes</span></div>
          <div><strong>BOT settles</strong><span>Bonds and disputes create accountability</span></div>
        </div>
      </section>

      <section className="console shell" id="console">
        <div className="section-heading">
          <div><span className="kicker">Live protocol surface</span><h2>Test the full verification loop</h2></div>
          <div className={`readiness ${isConfigured ? "ready" : ""}`}><span />{isConfigured ? "Contracts configured" : "Awaiting testnet deployment"}</div>
        </div>
        <div className="console-grid">
          <aside className="tabs" aria-label="Protocol actions">
            <button className={active === "asset" ? "active" : ""} onClick={() => setActive("asset")}><Building2 /> <span><strong>Create asset</strong><small>Issuer onboarding</small></span></button>
            <button className={active === "claim" ? "active" : ""} onClick={() => setActive("claim")}><FileCheck2 /> <span><strong>Submit yield</strong><small>Issuer workflow</small></span></button>
            <button className={active === "inspect" ? "active" : ""} onClick={() => setActive("inspect")}><SearchCheck /> <span><strong>Inspect report</strong><small>Public audit trail</small></span></button>
            <button className={active === "collect" ? "active" : ""} onClick={() => setActive("collect")}><CircleDollarSign /> <span><strong>Claim proceeds</strong><small>Investor workflow</small></span></button>
            <button className={active === "stake" ? "active" : ""} onClick={() => setActive("stake")}><LockKeyhole /> <span><strong>Stake as verifier</strong><small>Agent collateral</small></span></button>
            <button className={active === "challenge" ? "active" : ""} onClick={() => setActive("challenge")}><Gavel /> <span><strong>Challenge</strong><small>Dispute workflow</small></span></button>
            <button className={active === "resolve" ? "active" : ""} onClick={() => setActive("resolve")}><Scale /> <span><strong>Finalize</strong><small>Settlement & resolution</small></span></button>
          </aside>
          <div className="action-panel">
            {active !== "inspect" && !isConnected && <div className="guard"><Unplug size={19} /><span><strong>Wallet required</strong>Connect an injected wallet to begin.</span></div>}
            {active !== "inspect" && isConnected && !networkReady && <div className="guard warning"><ShieldCheck size={19} /><span><strong>Wrong network</strong>VeriFi writes only to chain 968 in this phase.</span><button onClick={() => switchChain({ chainId: botTestnet.id })}>{isSwitching ? "Switching…" : "Switch network"}</button></div>}
            {active !== "inspect" && isConnected && networkReady && !isConfigured && <div className="guard warning"><Bot size={19} /><span><strong>Deployment pending</strong>The interface is ready; testnet addresses will unlock transactions.</span></div>}

            {active === "claim" ? (
              <form onSubmit={(event) => void safelyRun(submitClaim, event)}>
                <div className="form-head"><div><span>02 / Issuer</span><h3>Commit revenue evidence</h3></div><span className="demo-badge">Sandbox oracle</span></div>
                <div className="field-grid">
                  <label>Asset ID<input name="assetId" defaultValue={`asset:issuer-${address?.slice(2, 10) ?? "connect"}`} required /></label>
                  <label>Period<input name="periodKey" defaultValue="2026-08" required /></label>
                </div>
                <label>Escrow amount <span>test USDT</span><div className="amount-input"><input name="amount" type="number" min="0.000001" step="0.000001" defaultValue="2000" required /><b>USDT</b></div></label>
                <fieldset><legend>Evidence scenario</legend>{scenarios.map((item, index) => <label className="scenario" key={item.value}><input type="radio" name="scenario" value={item.value} defaultChecked={index === 0} /><span><strong>{item.label}</strong><small>{item.detail}</small></span><CheckCircle2 size={18} /></label>)}</fieldset>
                <button className="submit" disabled={!canWrite || isPending}>{isPending ? <LoaderCircle className="spin" /> : <Fingerprint />} Approve & submit on testnet</button>
              </form>
            ) : (
              <form onSubmit={(event) => void safelyRun(runSimple, event)}>
                <div className="form-head"><div><span>{active === "asset" ? "01 / Issuer" : active === "inspect" ? "03 / Public" : active === "collect" ? "04 / Investor" : active === "stake" ? "05 / Verifier" : active === "challenge" ? "06 / Challenger" : "07 / Resolver"}</span><h3>{active === "asset" ? "Create and allocate an RWA" : active === "inspect" ? "Audit a verification result" : active === "collect" ? "Collect verified proceeds" : active === "stake" ? "Back attestations with BOT" : active === "challenge" ? "Dispute a bad attestation" : "Finalize an attestation"}</h3></div></div>
                {active === "asset" && <>
                  <div className="field-grid"><label>Asset ID<input name="newAssetId" value={`asset:issuer-${address?.slice(2, 10) ?? "connect"}`} readOnly required /></label><label>Committed terms<input value="2,000 USDT · due Aug 1 · exact payer" readOnly /></label></div>
                  <div className="field-grid"><label>Share token name<input name="tokenName" defaultValue="VeriFi Solar Two" required /></label><label>Symbol<input name="tokenSymbol" defaultValue="vSOLAR2" maxLength={12} required /></label></div>
                  <div className="field-grid"><label>Holder A<input name="holderA" value={address ?? ""} placeholder="Connect wallet" readOnly required /></label><label>Holder A shares<input name="holderAShares" type="number" defaultValue="60" min="0.000001" step="0.000001" required /></label></div>
                  <div className="field-grid"><label>Holder B<input name="holderB" value={address ?? ""} placeholder="Connect wallet" readOnly required /></label><label>Holder B shares<input name="holderBShares" type="number" defaultValue="40" min="0.000001" step="0.000001" required /></label></div>
                  <p className="bond-note"><ShieldCheck size={15} /> Uses the registered deterministic policy-v1 and a maximum of 20 initial holders.</p>
                </>}
                {active === "inspect" && <label>Claim ID<input name="reportClaimId" defaultValue={lastClaimId} placeholder="0x…" required /></label>}
                {active === "collect" && <label>Claim ID<input name="claimId" defaultValue={publicReport?.report.claimId ?? lastClaimId} placeholder="0x…" required /></label>}
                {active === "stake" && <label>Stake amount <span>testnet BOT</span><div className="amount-input"><input name="stakeAmount" type="number" min="0.001" step="0.001" defaultValue="10" required /><b>BOT</b></div></label>}
                {active === "challenge" && <><label>Attestation ID<input name="attestationId" defaultValue={publicReport?.attestationId} placeholder="0x…" required /></label><label>Counter-evidence reference<input name="counterEvidence" placeholder="IPFS CID, document hash, or reference" required /></label><p className="bond-note"><LockKeyhole size={15} /> Requires a 0.25 tBOT challenge bond.</p></>}
                {active === "resolve" && <><label>Attestation ID<input name="resolutionAttestationId" defaultValue={publicReport?.attestationId} placeholder="0x…" required /></label><label>Action<select name="resolutionMode" defaultValue="settle"><option value="settle">Settle unchallenged attestation</option><option value="overturn">Overturn false approval (resolver only)</option></select></label><p className="bond-note"><Scale size={15} /> Settlement is permissionless after the window; reversal requires the disclosed resolver role.</p></>}
                <button className="submit" disabled={(active !== "inspect" && !canWrite) || isPending}>{isPending ? <LoaderCircle className="spin" /> : active === "asset" ? <Building2 /> : active === "inspect" ? <SearchCheck /> : active === "resolve" ? <Scale /> : active === "challenge" ? <Gavel /> : active === "stake" ? <LockKeyhole /> : <CircleDollarSign />}{active === "asset" ? "Create testnet asset" : active === "inspect" ? "Load verification report" : active === "collect" ? "Claim distribution" : active === "stake" ? "Stake testnet BOT" : active === "resolve" ? "Finalize attestation" : "Open challenge"}</button>
                {active === "inspect" && publicReport && <div className={`report-card ${publicReport.report.outcome.toLowerCase()}`}>
                  <div className="report-title"><span>{publicReport.report.outcome}</span><small>{publicReport.report.policyVersion} · {publicReport.report.periodKey}</small></div>
                  <div className="rule-list">{publicReport.report.ruleResults.map((rule) => <div key={rule.ruleId}><b className={rule.status.toLowerCase()}>{rule.status}</b><span><strong>{rule.ruleId.replaceAll("_", " ")}</strong><small>{rule.message}</small></span></div>)}</div>
                  <p>{publicReport.report.limitations[0]}</p>
                  <div className="report-identifiers">
                    <div><span>Claim ID</span><code>{publicReport.report.claimId}</code><button type="button" onClick={() => void navigator.clipboard.writeText(publicReport.report.claimId)}>Copy</button></div>
                    {publicReport.attestationId && <div><span>Attestation ID</span><code>{publicReport.attestationId}</code><button type="button" onClick={() => void navigator.clipboard.writeText(publicReport.attestationId!)}>Copy</button></div>}
                    <div><span>Report hash</span><code>{publicReport.reportHash}</code><button type="button" onClick={() => void navigator.clipboard.writeText(publicReport.reportHash)}>Copy</button></div>
                  </div>
                  <div className="report-actions">
                    {publicReport.attestationId && <><button type="button" onClick={() => setActive("challenge")}>Challenge</button><button type="button" onClick={() => setActive("resolve")}>Finalize after 60s</button></>}
                    <button type="button" onClick={() => setActive("collect")}>Claim proceeds</button>
                  </div>
                </div>}
              </form>
            )}
            <div className="status-line"><span className={receipt.isSuccess ? "success-dot" : ""} /> <p>{receipt.isSuccess ? "Transaction confirmed on BOT Testnet." : status}</p>{txUrl && <a href={txUrl} target="_blank" rel="noreferrer">View tx <ArrowUpRight size={13} /></a>}</div>
          </div>
        </div>
      </section>

      <section className="trust shell" id="how">
        <div className="section-heading"><div><span className="kicker">The trust boundary</span><h2>Intelligence without authority</h2></div><p>AI does the ambiguous work. Transparent code makes the consequential decision.</p></div>
        <div className="trust-grid">
          <article><span className="step">01</span><Bot /><h3>Extract</h3><p>The agent reads invoices, bank proofs, and oracle responses into a strict schema. Every input and output is hashed.</p><small>Probabilistic · auditable</small></article>
          <article><span className="step">02</span><FileCheck2 /><h3>Evaluate</h3><p>A deterministic policy checks signatures, payer identity, dates, and amounts. The same facts always yield the same result.</p><small>Reproducible · versioned</small></article>
          <article><span className="step">03</span><ShieldCheck /><h3>Attest</h3><p>A bonded verifier signs the report. Anyone can challenge it before settlement; false approvals put stake at risk.</p><small>Accountable · challengeable</small></article>
          <article><span className="step">04</span><CircleDollarSign /><h3>Settle</h3><p>Verified escrow becomes claimable by the exact token-holder snapshot. No loops and no retroactive entitlement changes.</p><small>Onchain · pull-based</small></article>
        </div>
      </section>

      <footer className="shell"><a className="brand" href="#top"><span className="brand-mark"><Fingerprint size={18} /></span>VeriFi</a><p>Verifiable revenue rails for tokenized real-world assets.</p><span>Testnet prototype · not financial advice</span></footer>
    </main>
  );
}
