"use client";

import {
  ArrowUpRight,
  Building2,
  Bot,
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
import { formatUnits, getAddress, isAddress, isHex, keccak256, parseEther, parseUnits, stringToHex } from "viem";
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
import { assetFactoryAbi, attestationAbi, erc20Abi, stakingAbi, vaultAbi } from "../../lib/abis";
import {
  activeChain,
  challengeBondBot,
  challengeWindowSeconds,
  contracts,
  isConfigured,
  isMainnet,
  nativeTokenLabel,
  networkLabel,
  writesEnabled,
} from "../../lib/chain";
import { attestationRequestMessage } from "../../lib/attestationRequest";
import { evidencePreparationMessage } from "../../lib/evidenceAuthorization";
import { hashCanonical } from "@veritable/policy";
import { evidenceBundleSchema, type AssetTerms } from "@veritable/schemas";

type Action = "evidence" | "asset" | "claim" | "inspect" | "collect" | "stake" | "challenge" | "resolve";

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
  attestationId?: string;
  transactionHash?: string;
  report: PublicReport["report"];
}

function short(value?: string) {
  return value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "Not connected";
}

function bytes32(value: string) {
  if (isHex(value, { strict: true }) && value.length === 66) return value as `0x${string}`;
  return keccak256(stringToHex(value));
}

function strictBytes32(value: string, label: string) {
  if (!isHex(value, { strict: true }) || value.length !== 66) throw new Error(`${label} must be a 32-byte 0x-prefixed hash`);
  return value as `0x${string}`;
}

function termsFromForm(form: FormData, prefix: "asset" | "claim"): AssetTerms {
  return {
    expectedAmountMinor: parseUnits(String(form.get(`${prefix}ExpectedAmount`)), 6).toString(),
    dueDate: String(form.get(`${prefix}DueDate`)),
    windowDays: Number(form.get(`${prefix}WindowDays`)),
    amountToleranceMinor: parseUnits(String(form.get(`${prefix}Tolerance`)), 6).toString(),
    payerReferenceHash: strictBytes32(String(form.get(`${prefix}PayerReferenceHash`)), "Payer reference hash"),
  };
}

export default function Home() {
  const { address, chainId, isConnected } = useAccount();
  const { connectors, connect, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { writeContractAsync, data: transactionHash, isPending } = useWriteContract();
  const { signMessageAsync } = useSignMessage();
  const publicClient = usePublicClient({ chainId: activeChain.id });
  const receipt = useWaitForTransactionReceipt({ hash: transactionHash });
  const [active, setActive] = useState<Action>("evidence");
  const [status, setStatus] = useState(`Ready for a ${networkLabel} action.`);
  const [publicReport, setPublicReport] = useState<PublicReport>();
  const [lastClaimId, setLastClaimId] = useState("");
  const [lastAssetId, setLastAssetId] = useState("");
  const [lastEvidenceBundle, setLastEvidenceBundle] = useState("");
  const [preparedTerms, setPreparedTerms] = useState<AssetTerms>();

  const networkReady = chainId === activeChain.id;
  const canWrite = isConnected && networkReady && isConfigured && writesEnabled;
  const txUrl = transactionHash ? `${activeChain.blockExplorers.default.url}/tx/${transactionHash}` : undefined;
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

  async function prepareEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address) return;
    const form = new FormData(event.currentTarget);
    const file = form.get("evidenceDocument");
    if (!(file instanceof File) || file.size === 0) throw new Error("Choose a text-based PDF or plain-text evidence document");
    const periodKey = String(form.get("evidencePeriodKey"));
    const payerReferenceHash = strictBytes32(String(form.get("evidencePayerReferenceHash")), "Payer reference hash");
    const paymentEnvelope = JSON.parse(String(form.get("evidencePaymentEnvelope") || "{}"));
    const documentHash = keccak256(new Uint8Array(await file.arrayBuffer()));
    const assetTerms: AssetTerms = {
      expectedAmountMinor: parseUnits(String(form.get("evidenceExpectedAmount")), 6).toString(),
      dueDate: String(form.get("evidenceDueDate")),
      windowDays: Number(form.get("evidenceWindowDays")),
      amountToleranceMinor: parseUnits(String(form.get("evidenceTolerance")), 6).toString(),
      payerReferenceHash,
    };
    setStatus("Authorizing live evidence extraction…");
    const signature = await signMessageAsync({ message: evidencePreparationMessage({ requester: address, periodKey, payerReferenceHash, documentHash, chainId: activeChain.id }) });
    const payload = new FormData();
    payload.set("document", file);
    payload.set("requester", address);
    payload.set("signature", signature);
    payload.set("periodKey", periodKey);
    payload.set("paymentEnvelope", JSON.stringify(paymentEnvelope));
    payload.set("assetTerms", JSON.stringify(assetTerms));
    setStatus("DeepSeek is extracting the document and binding it to the signed payment record…");
    const response = await fetch("/v1/evidence/prepare", { method: "POST", body: payload });
    const result = await response.json() as { evidenceBundle?: unknown; providerRunId?: string; error?: string };
    if (!response.ok || !result.evidenceBundle) throw new Error(result.error || `Evidence service returned ${response.status}`);
    const serialized = JSON.stringify(evidenceBundleSchema.parse(result.evidenceBundle), null, 2);
    setLastEvidenceBundle(serialized);
    setPreparedTerms(assetTerms);
    setStatus(`Live evidence prepared and privately stored. DeepSeek run ${short(result.providerRunId)} is committed. Create the asset with the populated terms, or continue to Submit yield if it already exists.`);
    setActive("asset");
  }

  async function submitClaim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!contracts.vault || !contracts.settlement || !address || !publicClient) return;
    const form = new FormData(event.currentTarget);
    const assetId = bytes32(String(form.get("assetId")));
    const amount = parseUnits(String(form.get("amount")), 6);
    const evidenceBundle = evidenceBundleSchema.parse(JSON.parse(String(form.get("evidenceBundle") || "{}")));
    const periodKey = bytes32(evidenceBundle.periodKey);
    const evidenceRoot = hashCanonical(evidenceBundle) as `0x${string}`;
    const balance = await publicClient.readContract({
      address: contracts.settlement,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    });
    if (balance < amount) {
      throw new Error(`Insufficient ${isMainnet ? "official" : "Testnet"} USDT. Fund the connected wallet before submitting a claim.`);
    }
    setStatus("Approving test USDT escrow…");
    const approvalHash = await writeContractAsync({
      address: contracts.settlement,
      abi: erc20Abi,
      functionName: "approve",
      args: [contracts.vault, amount],
      chainId: activeChain.id,
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
      chainId: activeChain.id,
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
    const signature = await signMessageAsync({ message: attestationRequestMessage(claimId, activeChain.id, networkLabel) });
    const response = await fetch(`/v1/process/${claimId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requester: address, signature, evidenceBundle }),
    });
    if (!response.ok) throw new Error(`Verifier service returned ${response.status}`);
    const result = await response.json() as ProcessResult;
    const serializedBundle = JSON.stringify(evidenceBundle, null, 2);
    setLastEvidenceBundle(serializedBundle);
    window.localStorage.setItem(`veritable:evidence:${claimId}`, serializedBundle);
    setPublicReport({ reportHash: result.reportHash, attestationId: result.attestationId, attestationTransactionHash: result.transactionHash, report: result.report });
    setActive("inspect");
    setStatus(result.status === "INCONCLUSIVE"
      ? `Claim ${short(claimId)} is inconclusive; no onchain attestation was submitted.`
      : `Claim ${short(claimId)} was attested as ${result.outcome}. The ${challengeWindowSeconds}-second challenge window is open.`);
  }

  async function runSimple(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (active === "asset" && contracts.assetFactory && address) {
      const assetId = bytes32(String(form.get("newAssetId")));
      const holderInputs = [
        [String(form.get("holderA") || ""), String(form.get("holderAShares") || "")],
        [String(form.get("holderB") || ""), String(form.get("holderBShares") || "")],
      ].filter(([holder, shares]) => holder || shares);
      if (holderInputs.length === 0 || holderInputs.some(([holder, shares]) => !isAddress(holder) || !shares || Number(shares) <= 0)) throw new Error("Provide at least one valid holder and a positive share amount");
      const assetTerms = termsFromForm(form, "asset");
      const hash = await writeContractAsync({
        address: contracts.assetFactory,
        abi: assetFactoryAbi,
        functionName: "createAsset",
        args: [
          assetId,
          String(form.get("tokenName")),
          String(form.get("tokenSymbol")),
          bytes32("policy-v1"),
          hashCanonical(assetTerms) as `0x${string}`,
          holderInputs.map(([holder]) => getAddress(holder)),
          holderInputs.map(([, shares]) => parseUnits(shares, 18)),
        ],
        chainId: activeChain.id,
      });
      if (!publicClient) throw new Error(`${networkLabel} RPC client is unavailable`);
      const creationReceipt = await publicClient.waitForTransactionReceipt({ hash });
      if (creationReceipt.status !== "success") throw new Error("Asset creation reverted");
      setLastAssetId(assetId);
      setStatus("Asset created and shares allocated. Continue to Submit yield using the same Asset ID.");
      return;
    }
    if (active === "inspect") {
      setPublicReport(undefined);
      setStatus("Loading the redacted deterministic report…");
      const claimId = bytes32(String(form.get("reportClaimId")));
      setLastClaimId(claimId);
      const apiBase = process.env.NEXT_PUBLIC_API_URL || window.location.origin;
      const suppliedBundle = String(form.get("reportEvidenceBundle") || lastEvidenceBundle || window.localStorage.getItem(`veritable:evidence:${claimId}`) || "");
      const evidenceBundle = suppliedBundle ? evidenceBundleSchema.parse(JSON.parse(suppliedBundle)) : undefined;
      const response = await fetch(new URL(`/v1/reports/${claimId}`, apiBase), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ evidenceBundle }) });
      if (!response.ok) {
        setStatus(response.status === 404 ? "No report has been produced for that claim yet." : `Report service returned ${response.status}.`);
        return;
      }
      setPublicReport(await response.json() as PublicReport);
      setStatus("Verification report loaded from the agent's public audit trail.");
      return;
    }
    if (active === "collect" && contracts.vault) {
      await writeContractAsync({ address: contracts.vault, abi: vaultAbi, functionName: "claimYield", args: [bytes32(String(form.get("claimId")))], chainId: activeChain.id });
      setStatus("Distribution claim submitted against the immutable holder snapshot.");
    }
    if (active === "stake" && contracts.staking) {
      await writeContractAsync({ address: contracts.staking, abi: stakingAbi, functionName: "stake", value: parseEther(String(form.get("stakeAmount"))), chainId: activeChain.id });
      setStatus("Verifier stake submitted. Stake becomes slashable when an attestation locks it.");
    }
    if (active === "challenge" && contracts.attestation) {
      if (!challengeBondBot) throw new Error("Challenge bond is not configured for this deployment");
      await writeContractAsync({
        address: contracts.attestation,
        abi: attestationAbi,
        functionName: "challenge",
        args: [bytes32(String(form.get("attestationId"))), bytes32(String(form.get("counterEvidence")))],
        value: parseEther(challengeBondBot),
        chainId: activeChain.id,
      });
      setStatus(`Challenge submitted with a ${challengeBondBot} ${nativeTokenLabel} bond for resolver review.`);
    }
    if (active === "resolve" && contracts.attestation) {
      const attestationId = bytes32(String(form.get("resolutionAttestationId")));
      const mode = String(form.get("resolutionMode"));
      if (mode === "settle") {
        await writeContractAsync({ address: contracts.attestation, abi: attestationAbi, functionName: "settle", args: [attestationId], chainId: activeChain.id });
        setStatus("Unchallenged attestation settlement submitted after its challenge window.");
      } else {
        await writeContractAsync({ address: contracts.attestation, abi: attestationAbi, functionName: "resolve", args: [attestationId, false, 2, 0n], chainId: activeChain.id });
        setStatus("Resolver reversal submitted: claim blocked, verifier stake slashed, challenger bond returned.");
      }
    }
  }

  const connector = connectors[0];
  return (
    <main className="app-page">
      <nav className="nav shell">
        <a className="brand" href="/" aria-label="Veritable home"><span className="brand-mark"><Fingerprint size={19} /></span>Veritable</a>
        <div className="nav-right">
          <a className="docs-link" href="https://docs.botchain.ai" target="_blank" rel="noreferrer">BOT docs <ArrowUpRight size={14} /></a>
          {isConnected ? (
            <button className="wallet-button connected" aria-label={`Disconnect wallet ${walletLabel}`} onClick={() => disconnect()}><Wallet size={16} /><span>{walletLabel}</span></button>
          ) : (
            <button className="wallet-button" disabled={!connector || isConnecting} onClick={() => connector && connect({ connector })}>
              {isConnecting ? <LoaderCircle className="spin" size={16} /> : <Wallet size={16} />}<span>{isConnecting ? "Connecting" : "Connect wallet"}</span>
            </button>
          )}
        </div>
      </nav>

      <section className="hero shell" id="top">
        <div className="eyebrow"><ShieldCheck size={15} /> Built for the AI × RWA challenge</div>
        <h1>Make real-world yield<br /><span>prove itself.</span></h1>
        <p className="hero-copy">Veritable turns messy payment evidence into deterministic, challengeable onchain settlement—without letting an AI decide who gets paid.</p>
        <div className="hero-actions">
          <a className="primary-link" href="#console">Open {isMainnet ? "Mainnet" : "Testnet"} console <ArrowUpRight size={17} /></a>
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
          <div className={`readiness ${isConfigured ? "ready" : ""}`}><span />{isConfigured ? "Contracts configured" : `Awaiting ${networkLabel} deployment`}</div>
        </div>
        <div className="console-grid">
          <aside className="tabs" aria-label="Protocol actions">
            <button aria-pressed={active === "evidence"} className={active === "evidence" ? "active" : ""} onClick={() => setActive("evidence")}><Bot /> <span><strong>Prepare evidence</strong><small>DeepSeek + signed source</small></span></button>
            <button aria-pressed={active === "asset"} className={active === "asset" ? "active" : ""} onClick={() => setActive("asset")}><Building2 /> <span><strong>Create asset</strong><small>Issuer onboarding</small></span></button>
            <button aria-pressed={active === "claim"} className={active === "claim" ? "active" : ""} onClick={() => setActive("claim")}><FileCheck2 /> <span><strong>Submit yield</strong><small>Issuer workflow</small></span></button>
            <button aria-pressed={active === "inspect"} className={active === "inspect" ? "active" : ""} onClick={() => setActive("inspect")}><SearchCheck /> <span><strong>Inspect report</strong><small>Public audit trail</small></span></button>
            <button aria-pressed={active === "collect"} className={active === "collect" ? "active" : ""} onClick={() => setActive("collect")}><CircleDollarSign /> <span><strong>Claim proceeds</strong><small>Investor workflow</small></span></button>
            <button aria-pressed={active === "stake"} className={active === "stake" ? "active" : ""} onClick={() => setActive("stake")}><LockKeyhole /> <span><strong>Stake as verifier</strong><small>Agent collateral</small></span></button>
            <button aria-pressed={active === "challenge"} className={active === "challenge" ? "active" : ""} onClick={() => setActive("challenge")}><Gavel /> <span><strong>Challenge</strong><small>Dispute workflow</small></span></button>
            <button aria-pressed={active === "resolve"} className={active === "resolve" ? "active" : ""} onClick={() => setActive("resolve")}><Scale /> <span><strong>Finalize</strong><small>Settlement & resolution</small></span></button>
          </aside>
          <div className="action-panel">
            {active !== "inspect" && !isConnected && <div className="guard"><Unplug size={19} /><span><strong>Wallet required</strong>Connect an injected wallet to begin.</span></div>}
            {active !== "inspect" && isConnected && !networkReady && <div className="guard warning"><ShieldCheck size={19} /><span><strong>Wrong network</strong>This release writes only to {networkLabel} chain {activeChain.id}.</span><button onClick={() => switchChain({ chainId: activeChain.id })}>{isSwitching ? "Switching…" : "Switch network"}</button></div>}
            {active !== "inspect" && isConnected && networkReady && !isConfigured && <div className="guard warning"><Bot size={19} /><span><strong>Deployment pending</strong>The interface is ready; {networkLabel} addresses will unlock transactions.</span></div>}
            {active !== "inspect" && isConnected && networkReady && isConfigured && !writesEnabled && <div className="guard warning"><ShieldCheck size={19} /><span><strong>Mainnet writes locked</strong>This build is configured for read-only inspection until the migration gate is explicitly enabled.</span></div>}

            {active === "evidence" ? (
              <form onSubmit={(event) => void safelyRun(prepareEvidence, event)}>
                <div className="form-head"><div><span>01 / Evidence</span><h3>Extract and bind revenue evidence</h3></div><span className="demo-badge">Live DeepSeek</span></div>
                <div className="field-grid">
                  <label>Period<input name="evidencePeriodKey" placeholder="YYYY-MM" pattern="\d{4}-(0[1-9]|1[0-2])" required /></label>
                  <label>Evidence document<input name="evidenceDocument" type="file" accept="application/pdf,text/plain" required /></label>
                </div>
                <div className="field-grid">
                  <label>Payer reference hash<input name="evidencePayerReferenceHash" placeholder="0x… 32-byte redacted payer hash" required /></label>
                  <label>Evidence source<span> Independent signed record</span><input value="Configured evidence signer" readOnly /></label>
                </div>
                <label>Signed payment envelope <span>JSON</span><textarea name="evidencePaymentEnvelope" rows={8} placeholder='{"record":{"status":"FOUND","amountMinor":"…","paidAt":"YYYY-MM-DD","payerReferenceHash":"0x…","source":"…","issuedAt":"…","expiresAt":"…","payloadHash":"0x…"},"signer":"0x…","signature":"0x…"}' required /></label>
                <div className="field-grid">
                  <label>Expected amount <span>USD / nominal USDT</span><input name="evidenceExpectedAmount" type="number" min="0" step="0.000001" required /></label>
                  <label>Due date<input name="evidenceDueDate" type="date" required /></label>
                </div>
                <div className="field-grid">
                  <label>Allowed window <span>days</span><input name="evidenceWindowDays" type="number" min="0" max="60" step="1" required /></label>
                  <label>Amount tolerance <span>USD</span><input name="evidenceTolerance" type="number" min="0" step="0.000001" required /></label>
                </div>
                <label className="consent"><input type="checkbox" required /> I have permission to send this document's extracted text to DeepSeek and store the original in private evidence storage.</label>
                <p className="bond-note"><ShieldCheck size={15} /> DeepSeek extracts typed document facts. A separate signed payment source establishes payment status; originals and the canonical bundle are stored privately.</p>
                <button className="submit" disabled={!canWrite || isPending}><Bot /> Prepare live evidence</button>
              </form>
            ) : active === "claim" ? (
              <form onSubmit={(event) => void safelyRun(submitClaim, event)}>
                <div className="form-head"><div><span>03 / Issuer</span><h3>Commit provider-verified revenue evidence</h3></div><span className="demo-badge">Live providers</span></div>
                <label>Asset ID<input name="assetId" defaultValue={lastAssetId} placeholder="Asset label or bytes32 ID" required /></label>
                <label>Escrow amount <span>{isMainnet ? "official" : "Testnet"} USDT</span><div className="amount-input"><input name="amount" type="number" min="0.000001" step="0.000001" placeholder="Amount already held by this wallet" required /><b>USDT</b></div></label>
                <label>Prepared evidence bundle <span>DeepSeek + signed source</span><textarea name="evidenceBundle" rows={14} defaultValue={lastEvidenceBundle} placeholder="Prepare live evidence first, then paste the returned canonical bundle" required /></label>
                <p className="bond-note"><ShieldCheck size={15} /> The exact bundle is hashed onchain. DeepSeek facts must match registered terms, and the independent payment-source signature must validate.</p>
                <button className="submit" disabled={!canWrite || isPending}>{isPending ? <LoaderCircle className="spin" /> : <Fingerprint />} Approve & submit on {isMainnet ? "Mainnet" : "Testnet"}</button>
              </form>
            ) : (
              <form onSubmit={(event) => void safelyRun(runSimple, event)}>
                <div className="form-head"><div><span>{active === "asset" ? "02 / Issuer" : active === "inspect" ? "04 / Public" : active === "collect" ? "05 / Investor" : active === "stake" ? "06 / Verifier" : active === "challenge" ? "07 / Challenger" : "08 / Resolver"}</span><h3>{active === "asset" ? "Create and allocate an RWA" : active === "inspect" ? "Audit a verification result" : active === "collect" ? "Collect verified proceeds" : active === "stake" ? "Back attestations with BOT" : active === "challenge" ? "Dispute a bad attestation" : "Finalize an attestation"}</h3></div></div>
                {active === "asset" && <>
                  <div className="field-grid"><label>Asset ID<input name="newAssetId" placeholder="Unique asset label or bytes32 ID" required /></label><label>Payer reference hash<input name="assetPayerReferenceHash" defaultValue={preparedTerms?.payerReferenceHash} placeholder="Prepare evidence to bind the signed source" required /></label></div>
                  <div className="field-grid"><label>Share token name<input name="tokenName" required /></label><label>Symbol<input name="tokenSymbol" maxLength={12} required /></label></div>
                  <div className="field-grid"><label>Expected amount <span>USDT</span><input name="assetExpectedAmount" type="number" min="0" step="0.000001" defaultValue={preparedTerms ? formatUnits(BigInt(preparedTerms.expectedAmountMinor), 6) : undefined} required /></label><label>Due date<input name="assetDueDate" type="date" defaultValue={preparedTerms?.dueDate} required /></label></div>
                  <div className="field-grid"><label>Allowed window <span>days</span><input name="assetWindowDays" type="number" min="0" max="60" step="1" defaultValue={preparedTerms?.windowDays} required /></label><label>Amount tolerance <span>USDT</span><input name="assetTolerance" type="number" min="0" step="0.000001" defaultValue={preparedTerms ? formatUnits(BigInt(preparedTerms.amountToleranceMinor), 6) : undefined} required /></label></div>
                  <div className="field-grid"><label>Holder A<input name="holderA" defaultValue={address ?? ""} placeholder="0x…" required /></label><label>Holder A shares<input name="holderAShares" type="number" min="0.000001" step="0.000001" required /></label></div>
                  <div className="field-grid"><label>Holder B <span>optional</span><input name="holderB" placeholder="0x…" /></label><label>Holder B shares <span>optional</span><input name="holderBShares" type="number" min="0.000001" step="0.000001" /></label></div>
                  <p className="bond-note"><ShieldCheck size={15} /> Uses the registered deterministic policy-v1 and a maximum of 20 initial holders.</p>
                </>}
                {active === "inspect" && <><label>Claim ID<input name="reportClaimId" defaultValue={lastClaimId} placeholder="0x…" required /></label><label>Committed evidence bundle <span>optional recovery JSON</span><textarea name="reportEvidenceBundle" rows={8} defaultValue={lastEvidenceBundle} placeholder="Usually loaded from private durable storage; paste only for recovery" /></label></>}
                {active === "collect" && <label>Claim ID<input name="claimId" defaultValue={publicReport?.report.claimId ?? lastClaimId} placeholder="0x…" required /></label>}
                {active === "stake" && <label>Stake amount <span>{nativeTokenLabel}</span><div className="amount-input"><input name="stakeAmount" type="number" min="0.001" step="0.001" required /><b>{nativeTokenLabel}</b></div></label>}
                {active === "challenge" && <><label>Attestation ID<input name="attestationId" defaultValue={publicReport?.attestationId} placeholder="0x…" required /></label><label>Counter-evidence reference<input name="counterEvidence" placeholder="IPFS CID, document hash, or reference" required /></label><p className="bond-note"><LockKeyhole size={15} /> Requires a {challengeBondBot ?? "configured"} {nativeTokenLabel} challenge bond.</p></>}
                {active === "resolve" && <><label>Attestation ID<input name="resolutionAttestationId" defaultValue={publicReport?.attestationId} placeholder="0x…" required /></label><label>Action<select name="resolutionMode" defaultValue="settle"><option value="settle">Settle unchallenged attestation</option><option value="overturn">Overturn false approval (resolver only)</option></select></label><p className="bond-note"><Scale size={15} /> Settlement is permissionless after the window; reversal requires the disclosed resolver role.</p></>}
                <button className="submit" disabled={(active !== "inspect" && !canWrite) || isPending}>{isPending ? <LoaderCircle className="spin" /> : active === "asset" ? <Building2 /> : active === "inspect" ? <SearchCheck /> : active === "resolve" ? <Scale /> : active === "challenge" ? <Gavel /> : active === "stake" ? <LockKeyhole /> : <CircleDollarSign />}{active === "asset" ? `Create ${isMainnet ? "Mainnet" : "Testnet"} asset` : active === "inspect" ? "Load verification report" : active === "collect" ? "Claim distribution" : active === "stake" ? `Stake ${nativeTokenLabel}` : active === "resolve" ? "Finalize attestation" : "Open challenge"}</button>
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
                    {publicReport.attestationId && <><button type="button" onClick={() => setActive("challenge")}>Challenge</button><button type="button" onClick={() => setActive("resolve")}>Finalize after {challengeWindowSeconds}s</button></>}
                    <button type="button" onClick={() => setActive("collect")}>Claim proceeds</button>
                  </div>
                </div>}
              </form>
            )}
            <div className="status-line"><span className={receipt.isSuccess ? "success-dot" : ""} /> <p>{receipt.isSuccess ? `Transaction confirmed on ${networkLabel}.` : status}</p>{txUrl && <a href={txUrl} target="_blank" rel="noreferrer">View tx <ArrowUpRight size={13} /></a>}</div>
          </div>
        </div>
      </section>

      <section className="trust shell" id="how">
        <div className="section-heading"><div><span className="kicker">The trust boundary</span><h2>Intelligence without authority</h2></div><p>AI does the ambiguous work. Transparent code makes the consequential decision.</p></div>
        <div className="trust-grid">
          <article><span className="step">01</span><Bot /><h3>Extract</h3><p>An external extraction run turns source documents into typed, cited facts. Its documents, output, and signed payment record are hash-committed.</p><small>Source-bound · auditable</small></article>
          <article><span className="step">02</span><FileCheck2 /><h3>Evaluate</h3><p>A deterministic policy checks signatures, payer identity, dates, and amounts. The same facts always yield the same result.</p><small>Reproducible · versioned</small></article>
          <article><span className="step">03</span><ShieldCheck /><h3>Attest</h3><p>A bonded verifier signs the report. Anyone can challenge it before settlement; false approvals put stake at risk.</p><small>Accountable · challengeable</small></article>
          <article><span className="step">04</span><CircleDollarSign /><h3>Settle</h3><p>Verified escrow becomes claimable by the exact token-holder snapshot. No loops and no retroactive entitlement changes.</p><small>Onchain · pull-based</small></article>
        </div>
      </section>

      <footer className="shell"><a className="brand" href="#top"><span className="brand-mark"><Fingerprint size={18} /></span>Veritable</a><p>Verifiable revenue rails for tokenized real-world assets.</p><span>Testnet prototype · not financial advice</span></footer>
    </main>
  );
}
