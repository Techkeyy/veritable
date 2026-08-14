"use client";

import {
  ArrowUpRight,
  Building2,
  Bot,
  CircleDollarSign,
  Copy,
  FileCheck2,
  SearchCheck,
  Scale,
  Store,
  Fingerprint,
  Gavel,
  LoaderCircle,
  LockKeyhole,
  Link2,
  ShieldCheck,
  Unplug,
  Wallet,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { formatUnits, getAddress, isAddress, isHex, keccak256, parseEther, parseUnits, stringToHex, zeroHash } from "viem";
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
import { assetFactoryAbi, assetRegistryAbi, attestationAbi, erc20Abi, marketplaceAbi, stakingAbi, vaultAbi } from "../../lib/abis";
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
import { evidencePreparationMessage, evidenceRequestMessage } from "../../lib/evidenceAuthorization";
import { hashCanonical } from "@veritable/policy";
import { evidenceBundleSchema, type AssetTerms } from "@veritable/schemas";

type Action = "evidence" | "asset" | "list" | "claim" | "inspect" | "collect" | "stake" | "challenge" | "resolve";
type ProofMethod = "BOT_TRANSACTION" | "COUNTERPARTY_SIGNATURE";

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
  const [proofMethod, setProofMethod] = useState<ProofMethod>("BOT_TRANSACTION");
  const [paymentRequestId, setPaymentRequestId] = useState("");
  const [confirmationUrl, setConfirmationUrl] = useState("");
  const [confirmationStatus, setConfirmationStatus] = useState<"IDLE" | "PENDING" | "CONFIRMED">("IDLE");

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
    const documentHash = keccak256(new Uint8Array(await file.arrayBuffer()));
    const assetTerms: AssetTerms = {
      expectedAmountMinor: parseUnits(String(form.get("evidenceExpectedAmount")), 6).toString(),
      dueDate: String(form.get("evidenceDueDate")),
      windowDays: Number(form.get("evidenceWindowDays")),
      amountToleranceMinor: parseUnits(String(form.get("evidenceTolerance")), 6).toString(),
      payerReferenceHash: zeroHash,
    };
    const transactionHash = String(form.get("evidenceTxHash") || "");
    const paymentProof = proofMethod === "BOT_TRANSACTION"
      ? { kind: "BOT_TRANSACTION" as const, txHash: transactionHash }
      : { kind: "COUNTERPARTY_SIGNATURE" as const, requestId: paymentRequestId };
    if (proofMethod === "COUNTERPARTY_SIGNATURE" && confirmationStatus !== "CONFIRMED") {
      throw new Error("The registered payer must confirm the payment before evidence can be prepared");
    }
    const proofReference = proofMethod === "BOT_TRANSACTION"
      ? `BOT_TRANSACTION:${transactionHash.toLowerCase()}`
      : `COUNTERPARTY_SIGNATURE:${paymentRequestId}`;
    setStatus("Authorizing live evidence extraction…");
    const signature = await signMessageAsync({ message: evidencePreparationMessage({ requester: address, periodKey, proofReference, documentHash, chainId: activeChain.id }) });
    const payload = new FormData();
    payload.set("document", file);
    payload.set("requester", address);
    payload.set("signature", signature);
    payload.set("periodKey", periodKey);
    payload.set("paymentProof", JSON.stringify(paymentProof));
    payload.set("assetTerms", JSON.stringify(assetTerms));
    setStatus("DeepSeek is extracting the document and binding it to the verified payment proof…");
    const response = await fetch("/v1/evidence/prepare", { method: "POST", body: payload });
    const result = await response.json() as { evidenceBundle?: unknown; providerRunId?: string; error?: string };
    if (!response.ok || !result.evidenceBundle) throw new Error(result.error || `Evidence service returned ${response.status}`);
    const parsedBundle = evidenceBundleSchema.parse(result.evidenceBundle);
    const serialized = JSON.stringify(parsedBundle, null, 2);
    setLastEvidenceBundle(serialized);
    setPreparedTerms(parsedBundle.assetTerms);
    setStatus(`Live evidence prepared and privately stored. DeepSeek run ${short(result.providerRunId)} is committed. Create the asset with the populated terms, or continue to Submit yield if it already exists.`);
    setActive("asset");
  }

  async function createPayerRequest() {
    try {
      if (!address) throw new Error("Connect the issuer wallet first");
      const formElement = document.getElementById("evidence-form");
      if (!(formElement instanceof HTMLFormElement)) throw new Error("Evidence form is unavailable");
      const form = new FormData(formElement);
      const file = form.get("evidenceDocument");
      const payer = String(form.get("evidencePayerWallet") || "");
      const periodKey = String(form.get("evidencePeriodKey") || "");
      const paidAt = String(form.get("evidencePaidAt") || "");
      if (!(file instanceof File) || file.size === 0) throw new Error("Choose the evidence document first");
      if (!isAddress(payer)) throw new Error("Enter the payer's wallet address");
      const documentHash = keccak256(new Uint8Array(await file.arrayBuffer()));
      const amountMinor = parseUnits(String(form.get("evidenceExpectedAmount")), 6).toString();
      setStatus("Authorizing the payer confirmation request…");
      const signature = await signMessageAsync({
        message: evidenceRequestMessage({
          issuer: address,
          payer,
          periodKey,
          amountMinor,
          paidAt,
          documentHash,
          chainId: activeChain.id,
        }),
      });
      const response = await fetch("/v1/evidence/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ issuer: address, payer, periodKey, amountMinor, paidAt, documentHash, signature }),
      });
      const result = await response.json() as { requestId?: string; confirmationUrl?: string; error?: string };
      if (!response.ok || !result.requestId || !result.confirmationUrl) throw new Error(result.error || "Could not create payer request");
      setPaymentRequestId(result.requestId);
      setConfirmationUrl(result.confirmationUrl);
      setConfirmationStatus("PENDING");
      setStatus("Payer link created. Share it with the registered payer, then check confirmation.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not create payer request");
    }
  }

  async function checkPayerRequest() {
    try {
      if (!paymentRequestId) throw new Error("Create a payer request first");
      const response = await fetch(`/v1/evidence/requests/${paymentRequestId}`, { cache: "no-store" });
      const result = await response.json() as { status?: "PENDING" | "CONFIRMED"; error?: string };
      if (!response.ok || !result.status) throw new Error(result.error || "Could not check payer confirmation");
      setConfirmationStatus(result.status);
      setStatus(result.status === "CONFIRMED" ? "Payer confirmation received. Evidence is ready to prepare." : "Still waiting for the payer signature.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not check payer confirmation");
    }
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
    if (active === "list" && contracts.assetRegistry && contracts.marketplace && address) {
      if (!publicClient) throw new Error(`${networkLabel} RPC client is unavailable`);
      const assetId = bytes32(String(form.get("listingAssetId")));
      const shareAmount = parseUnits(String(form.get("listingShareAmount")), 18);
      const pricePerShareMinor = parseUnits(String(form.get("listingPrice")), 6);
      const shareToken = await publicClient.readContract({
        address: contracts.assetRegistry,
        abi: assetRegistryAbi,
        functionName: "shareTokenOf",
        args: [assetId],
      });
      if (shareToken === "0x0000000000000000000000000000000000000000") throw new Error("That asset is not registered");
      setStatus("Approving the marketplace to escrow the listed shares…");
      const approval = await writeContractAsync({
        address: shareToken,
        abi: erc20Abi,
        functionName: "approve",
        args: [contracts.marketplace, shareAmount],
        chainId: activeChain.id,
      });
      if ((await publicClient.waitForTransactionReceipt({ hash: approval })).status !== "success") throw new Error("Share-token approval reverted");
      setStatus("Creating the public fixed-price offering…");
      const listingHash = await writeContractAsync({
        address: contracts.marketplace,
        abi: marketplaceAbi,
        functionName: "createListing",
        args: [assetId, shareAmount, pricePerShareMinor, String(form.get("listingMetadata") || "")],
        chainId: activeChain.id,
      });
      if ((await publicClient.waitForTransactionReceipt({ hash: listingHash })).status !== "success") throw new Error("Marketplace listing reverted");
      setStatus("Offering is live. Any Testnet wallet can now purchase the escrowed shares.");
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
          <a className="docs-link" href="/marketplace">Marketplace <Store size={14} /></a>
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
        <p className="hero-copy">Veritable turns messy payment evidence into deterministic, challengeable onchain settlement without letting an AI decide who gets paid.</p>
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
          <aside className="tabs" aria-label="Protocol actions by role">
            <div className="tab-group">
              <div className="tab-group-label"><span>Issuer</span><small>Publish & report</small></div>
              <button aria-pressed={active === "evidence"} className={active === "evidence" ? "active" : ""} onClick={() => setActive("evidence")}><Bot /> <span><strong>Prepare evidence</strong><small>DeepSeek + signed source</small></span></button>
              <button aria-pressed={active === "asset"} className={active === "asset" ? "active" : ""} onClick={() => setActive("asset")}><Building2 /> <span><strong>Create asset</strong><small>Issuer onboarding</small></span></button>
              <button aria-pressed={active === "list"} className={active === "list" ? "active" : ""} onClick={() => setActive("list")}><Store /> <span><strong>List offering</strong><small>Public primary sale</small></span></button>
              <button aria-pressed={active === "claim"} className={active === "claim" ? "active" : ""} onClick={() => setActive("claim")}><FileCheck2 /> <span><strong>Submit yield</strong><small>Deposit verified income</small></span></button>
            </div>
            <div className="tab-group">
              <div className="tab-group-label"><span>Investor & public</span><small>Review & collect</small></div>
              <a className="tab-market-link" href="/marketplace"><Store /> <span><strong>Browse marketplace</strong><small>Discover public offerings</small></span></a>
              <button aria-pressed={active === "inspect"} className={active === "inspect" ? "active" : ""} onClick={() => setActive("inspect")}><SearchCheck /> <span><strong>Inspect report</strong><small>Public audit trail</small></span></button>
              <button aria-pressed={active === "collect"} className={active === "collect" ? "active" : ""} onClick={() => setActive("collect")}><CircleDollarSign /> <span><strong>Claim proceeds</strong><small>Investor distributions</small></span></button>
            </div>
            <div className="tab-group">
              <div className="tab-group-label"><span>Protocol security</span><small>Verify & dispute</small></div>
              <button aria-pressed={active === "stake"} className={active === "stake" ? "active" : ""} onClick={() => setActive("stake")}><LockKeyhole /> <span><strong>Stake as verifier</strong><small>Agent collateral</small></span></button>
              <button aria-pressed={active === "challenge"} className={active === "challenge" ? "active" : ""} onClick={() => setActive("challenge")}><Gavel /> <span><strong>Challenge</strong><small>Dispute an attestation</small></span></button>
              <button aria-pressed={active === "resolve"} className={active === "resolve" ? "active" : ""} onClick={() => setActive("resolve")}><Scale /> <span><strong>Finalize</strong><small>Settlement & resolution</small></span></button>
            </div>
          </aside>
          <div className="action-panel">
            {active !== "inspect" && !isConnected && <div className="guard"><Unplug size={19} /><span><strong>Wallet required</strong>Connect an injected wallet to begin.</span></div>}
            {active !== "inspect" && isConnected && !networkReady && <div className="guard warning"><ShieldCheck size={19} /><span><strong>Wrong network</strong>This release writes only to {networkLabel} chain {activeChain.id}.</span><button onClick={() => switchChain({ chainId: activeChain.id })}>{isSwitching ? "Switching…" : "Switch network"}</button></div>}
            {active !== "inspect" && isConnected && networkReady && !isConfigured && <div className="guard warning"><Bot size={19} /><span><strong>Deployment pending</strong>The interface is ready; {networkLabel} addresses will unlock transactions.</span></div>}
            {active !== "inspect" && isConnected && networkReady && isConfigured && !writesEnabled && <div className="guard warning"><ShieldCheck size={19} /><span><strong>Mainnet writes locked</strong>This build is configured for read-only inspection until the migration gate is explicitly enabled.</span></div>}

            {active === "evidence" ? (
              <form id="evidence-form" onSubmit={(event) => void safelyRun(prepareEvidence, event)}>
                <div className="form-head"><div><span>01 / Evidence</span><h3>Extract and prove revenue</h3></div><span className="demo-badge">No manual JSON</span></div>
                <div className="field-grid">
                  <label>Period<input name="evidencePeriodKey" placeholder="YYYY-MM" pattern="\d{4}-(0[1-9]|1[0-2])" required /></label>
                  <label>Evidence document<input name="evidenceDocument" type="file" accept="application/pdf,text/plain" required /></label>
                </div>
                <div className="field-grid">
                  <label>Expected amount <span>USD / nominal USDT</span><input name="evidenceExpectedAmount" type="number" min="0" step="0.000001" required /></label>
                  <label>Due date<input name="evidenceDueDate" type="date" required /></label>
                </div>
                <div className="field-grid">
                  <label>Allowed window <span>days</span><input name="evidenceWindowDays" type="number" min="0" max="60" step="1" required /></label>
                  <label>Amount tolerance <span>USD</span><input name="evidenceTolerance" type="number" min="0" step="0.000001" required /></label>
                </div>
                <fieldset className="proof-methods">
                  <legend>How will payment be proven?</legend>
                  <button type="button" aria-pressed={proofMethod === "BOT_TRANSACTION"} className={proofMethod === "BOT_TRANSACTION" ? "active" : ""} onClick={() => setProofMethod("BOT_TRANSACTION")}>
                    <Fingerprint /><span><strong>BOT payment</strong><small>Verify a real Testnet USDT transfer</small></span>
                  </button>
                  <button type="button" aria-pressed={proofMethod === "COUNTERPARTY_SIGNATURE"} className={proofMethod === "COUNTERPARTY_SIGNATURE" ? "active" : ""} onClick={() => setProofMethod("COUNTERPARTY_SIGNATURE")}>
                    <Link2 /><span><strong>Payer confirmation</strong><small>Send a secure signature link</small></span>
                  </button>
                </fieldset>
                {proofMethod === "BOT_TRANSACTION" ? (
                  <>
                    <label>BOT payment transaction<input name="evidenceTxHash" placeholder="0x… transaction that transferred Testnet USDT to this wallet" required /></label>
                    <p className="bond-note"><ShieldCheck size={15} /> Veritable independently checks the token, sender, recipient, amount, block timestamp, and transaction success.</p>
                  </>
                ) : (
                  <div className="payer-request">
                    <div className="field-grid">
                      <label>Registered payer wallet<input name="evidencePayerWallet" placeholder="0x… payer wallet" required /></label>
                      <label>Payment date<input name="evidencePaidAt" type="date" required /></label>
                    </div>
                    <button className="secondary-action" type="button" onClick={() => void createPayerRequest()}><Link2 size={16} /> Create payer link</button>
                    {confirmationUrl && <div className="share-link">
                      <span><b>{confirmationStatus}</b><code>{confirmationUrl}</code></span>
                      <button type="button" aria-label="Copy payer link" onClick={() => void navigator.clipboard.writeText(confirmationUrl)}><Copy size={15} /></button>
                      <a href={confirmationUrl} target="_blank" rel="noreferrer">Open <ArrowUpRight size={14} /></a>
                      <button type="button" onClick={() => void checkPayerRequest()}>Check status</button>
                    </div>}
                    <p className="bond-note"><ShieldCheck size={15} /> The payer reviews the amount and date, then signs from the registered wallet. No funds or bank credentials are requested.</p>
                  </div>
                )}
                <label className="consent"><input type="checkbox" required /> I have permission to send this document's extracted text to DeepSeek and store the original in private evidence storage.</label>
                <button className="submit" disabled={!canWrite || isPending || (proofMethod === "COUNTERPARTY_SIGNATURE" && confirmationStatus !== "CONFIRMED")}><Bot /> Verify proof & prepare evidence</button>
              </form>
            ) : active === "claim" ? (
              <form onSubmit={(event) => void safelyRun(submitClaim, event)}>
                <div className="form-head"><div><span>04 / Issuer</span><h3>Commit provider-verified revenue evidence</h3></div><span className="demo-badge">Live providers</span></div>
                <label>Asset ID<input name="assetId" defaultValue={lastAssetId} placeholder="Asset label or bytes32 ID" required /></label>
                <label>Escrow amount <span>{isMainnet ? "official" : "Testnet"} USDT</span><div className="amount-input"><input name="amount" type="number" min="0.000001" step="0.000001" placeholder="Amount already held by this wallet" required /><b>USDT</b></div></label>
                <label>Prepared evidence bundle <span>Generated automatically</span><textarea name="evidenceBundle" rows={14} defaultValue={lastEvidenceBundle} placeholder="Prepare live evidence first; Veritable fills this automatically" required /></label>
                <p className="bond-note"><ShieldCheck size={15} /> The exact bundle is hashed onchain. DeepSeek facts must match registered terms, and the selected payment proof is independently revalidated.</p>
                <button className="submit" disabled={!canWrite || isPending}>{isPending ? <LoaderCircle className="spin" /> : <Fingerprint />} Approve & submit on {isMainnet ? "Mainnet" : "Testnet"}</button>
              </form>
            ) : (
              <form onSubmit={(event) => void safelyRun(runSimple, event)}>
                <div className="form-head"><div><span>{active === "asset" ? "02 / Issuer" : active === "list" ? "03 / Issuer" : active === "inspect" ? "05 / Public" : active === "collect" ? "06 / Investor" : active === "stake" ? "07 / Verifier" : active === "challenge" ? "08 / Challenger" : "09 / Resolver"}</span><h3>{active === "asset" ? "Create and allocate an RWA" : active === "list" ? "Publish a fixed-price offering" : active === "inspect" ? "Audit a verification result" : active === "collect" ? "Collect verified proceeds" : active === "stake" ? "Back attestations with BOT" : active === "challenge" ? "Dispute a bad attestation" : "Finalize an attestation"}</h3></div></div>
                {active === "asset" && <>
                  <div className="field-grid"><label>Asset ID<input name="newAssetId" placeholder="Unique asset label or bytes32 ID" required /></label><label>Payer reference hash<input name="assetPayerReferenceHash" defaultValue={preparedTerms?.payerReferenceHash} placeholder="Prepare evidence to bind the signed source" required /></label></div>
                  <div className="field-grid"><label>Share token name<input name="tokenName" required /></label><label>Symbol<input name="tokenSymbol" maxLength={12} required /></label></div>
                  <div className="field-grid"><label>Expected amount <span>USDT</span><input name="assetExpectedAmount" type="number" min="0" step="0.000001" defaultValue={preparedTerms ? formatUnits(BigInt(preparedTerms.expectedAmountMinor), 6) : undefined} required /></label><label>Due date<input name="assetDueDate" type="date" defaultValue={preparedTerms?.dueDate} required /></label></div>
                  <div className="field-grid"><label>Allowed window <span>days</span><input name="assetWindowDays" type="number" min="0" max="60" step="1" defaultValue={preparedTerms?.windowDays} required /></label><label>Amount tolerance <span>USDT</span><input name="assetTolerance" type="number" min="0" step="0.000001" defaultValue={preparedTerms ? formatUnits(BigInt(preparedTerms.amountToleranceMinor), 6) : undefined} required /></label></div>
                  <div className="field-grid"><label>Holder A<input name="holderA" defaultValue={address ?? ""} placeholder="0x…" required /></label><label>Holder A shares<input name="holderAShares" type="number" min="0.000001" step="0.000001" required /></label></div>
                  <div className="field-grid"><label>Holder B <span>optional</span><input name="holderB" placeholder="0x…" /></label><label>Holder B shares <span>optional</span><input name="holderBShares" type="number" min="0.000001" step="0.000001" /></label></div>
                  <p className="bond-note"><ShieldCheck size={15} /> Uses the registered deterministic policy-v1 and a maximum of 20 initial holders.</p>
                </>}
                {active === "list" && <>
                  <label>Registered asset ID<input name="listingAssetId" defaultValue={lastAssetId} placeholder="Asset label or bytes32 ID" required /></label>
                  <div className="field-grid"><label>Shares to offer<input name="listingShareAmount" type="number" min="0.000001" step="0.000001" required /></label><label>Price per share <span>TestUSDT</span><input name="listingPrice" type="number" min="0.000001" step="0.000001" required /></label></div>
                  <label>Property summary or metadata URI <span>public</span><input name="listingMetadata" placeholder="e.g. Lekki rental property · ipfs://…" /></label>
                  <p className="bond-note"><ShieldCheck size={15} /> Listed shares are escrowed by the marketplace. Buyers pay the connected issuer directly in TestUSDT.</p>
                </>}
                {active === "inspect" && <><label>Claim ID<input name="reportClaimId" defaultValue={lastClaimId} placeholder="0x…" required /></label><label>Committed evidence bundle <span>optional recovery JSON</span><textarea name="reportEvidenceBundle" rows={8} defaultValue={lastEvidenceBundle} placeholder="Usually loaded from private durable storage; paste only for recovery" /></label></>}
                {active === "collect" && <label>Claim ID<input name="claimId" defaultValue={publicReport?.report.claimId ?? lastClaimId} placeholder="0x…" required /></label>}
                {active === "stake" && <label>Stake amount <span>{nativeTokenLabel}</span><div className="amount-input"><input name="stakeAmount" type="number" min="0.001" step="0.001" required /><b>{nativeTokenLabel}</b></div></label>}
                {active === "challenge" && <><label>Attestation ID<input name="attestationId" defaultValue={publicReport?.attestationId} placeholder="0x…" required /></label><label>Counter-evidence reference<input name="counterEvidence" placeholder="IPFS CID, document hash, or reference" required /></label><p className="bond-note"><LockKeyhole size={15} /> Requires a {challengeBondBot ?? "configured"} {nativeTokenLabel} challenge bond.</p></>}
                {active === "resolve" && <><label>Attestation ID<input name="resolutionAttestationId" defaultValue={publicReport?.attestationId} placeholder="0x…" required /></label><label>Action<select name="resolutionMode" defaultValue="settle"><option value="settle">Settle unchallenged attestation</option><option value="overturn">Overturn false approval (resolver only)</option></select></label><p className="bond-note"><Scale size={15} /> Settlement is permissionless after the window; reversal requires the disclosed resolver role.</p></>}
                <button className="submit" disabled={(active !== "inspect" && !canWrite) || isPending}>{isPending ? <LoaderCircle className="spin" /> : active === "asset" ? <Building2 /> : active === "list" ? <Store /> : active === "inspect" ? <SearchCheck /> : active === "resolve" ? <Scale /> : active === "challenge" ? <Gavel /> : active === "stake" ? <LockKeyhole /> : <CircleDollarSign />}{active === "asset" ? `Create ${isMainnet ? "Mainnet" : "Testnet"} asset` : active === "list" ? "Publish offering" : active === "inspect" ? "Load verification report" : active === "collect" ? "Claim distribution" : active === "stake" ? `Stake ${nativeTokenLabel}` : active === "resolve" ? "Finalize attestation" : "Open challenge"}</button>
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
