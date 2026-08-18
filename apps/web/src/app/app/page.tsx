"use client";

import {
  ArrowUpRight,
  Bot,
  CircleDollarSign,
  Copy,
  FileText,
  Fingerprint,
  Gavel,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Scale,
  ShieldCheck,
  Store,
  Unplug,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { getAddress, isAddress, isHex, keccak256, parseEther, parseUnits, stringToHex, zeroAddress, zeroHash } from "viem";
import {
  useAccount,
  useConnect,
  usePublicClient,
  useSignMessage,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { SiteNav } from "../../components/site-nav";
import { assetFactoryAbi, assetRegistryAbi, attestationAbi, erc20Abi, marketplaceAbi, stakingAbi, vaultAbi } from "../../lib/abis";
import { attestationRequestMessage } from "../../lib/attestationRequest";
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
import { evidencePreparationMessage, evidenceRequestMessage } from "../../lib/evidenceAuthorization";
import {
  compactId,
  currentPeriodKey,
  firstOfPeriod,
  formatAmount,
  formatCountdown,
  outcomeCopy,
  periodLabel,
  RULE_COPY,
  sampleIncomeText,
  symbolFromName,
} from "../../lib/format";
import { loadSession, recallEvidence, rememberEvidence, saveSession, type WorkspaceSession } from "../../lib/session";
import { hashCanonical } from "@veritable/policy";
import { evidenceBundleSchema, type EvidenceBundle } from "@veritable/schemas";

type Mode = "issue" | "track";
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

function bytes32(value: string) {
  if (isHex(value, { strict: true }) && value.length === 66) return value as `0x${string}`;
  return keccak256(stringToHex(value));
}

function downloadText(filename: string, contents: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function AppPage() {
  const { address, chainId, isConnected } = useAccount();
  const { connectors, connect, isPending: isConnecting } = useConnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { writeContractAsync, data: transactionHash, isPending } = useWriteContract();
  const { signMessageAsync } = useSignMessage();
  const publicClient = usePublicClient({ chainId: activeChain.id });
  const receipt = useWaitForTransactionReceipt({ hash: transactionHash });
  const connector = connectors[0];

  const [mode, setMode] = useState<Mode>("issue");
  const [session, setSession] = useState<WorkspaceSession>(() => loadSession());
  const [status, setStatus] = useState("Connect a wallet to report this month’s income.");
  const [propertyName, setPropertyName] = useState("");
  const [periodKey, setPeriodKey] = useState(currentPeriodKey());
  const [expectedAmount, setExpectedAmount] = useState("2000");
  const [dueDate, setDueDate] = useState(firstOfPeriod(currentPeriodKey()));
  const [windowDays, setWindowDays] = useState("5");
  const [tolerance, setTolerance] = useState("0");
  const [leaseFile, setLeaseFile] = useState<File>();
  const [proofMethod, setProofMethod] = useState<ProofMethod>("BOT_TRANSACTION");
  const [paymentTxHash, setPaymentTxHash] = useState("");
  const [payerWallet, setPayerWallet] = useState("");
  const [paidAt, setPaidAt] = useState(firstOfPeriod(currentPeriodKey()));
  const [paymentRequestId, setPaymentRequestId] = useState("");
  const [confirmationUrl, setConfirmationUrl] = useState("");
  const [confirmationStatus, setConfirmationStatus] = useState<"IDLE" | "PENDING" | "CONFIRMED">("IDLE");
  const [publicReport, setPublicReport] = useState<PublicReport>();
  const [lookupClaimId, setLookupClaimId] = useState("");
  const [now, setNow] = useState(Date.now());
  const [listShares, setListShares] = useState("40");
  const [listPrice, setListPrice] = useState("10");
  const [stakeAmount, setStakeAmount] = useState("5");
  const [counterEvidence, setCounterEvidence] = useState("public-challenge");

  const networkReady = chainId === activeChain.id;
  const canWrite = isConnected && networkReady && isConfigured && writesEnabled;
  const txUrl = transactionHash ? `${activeChain.blockExplorers.default.url}/tx/${transactionHash}` : undefined;
  const remainingSeconds = session.attestedAt
    ? Math.max(0, Math.ceil((session.attestedAt + challengeWindowSeconds * 1000 - now) / 1000))
    : 0;
  const windowOpen = Boolean(session.attestationId) && remainingSeconds > 0 && !session.settled;
  const windowClosed = Boolean(session.attestationId) && remainingSeconds === 0;

  const signingSteps = useMemo(() => [
    "Approve the TestUSDT escrow",
    "Submit this month’s claim",
    "Authorize the bonded verifier",
  ], []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hash = window.location.hash;
    if (params.get("mode") === "track" || hash === "#console" || hash === "#inspect") {
      setMode("track");
    }
    const stored = loadSession();
    setSession(stored);
    if (stored.assetName) setPropertyName(stored.assetName);
    if (stored.periodKey) {
      setPeriodKey(stored.periodKey);
      setDueDate(firstOfPeriod(stored.periodKey));
      setPaidAt(firstOfPeriod(stored.periodKey));
    }
    if (stored.expectedAmount) setExpectedAmount(stored.expectedAmount);
    if (stored.claimId) setLookupClaimId(stored.claimId);
  }, []);

  useEffect(() => {
    saveSession(session);
  }, [session]);

  useEffect(() => {
    if (mode !== "track") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [mode]);

  useEffect(() => {
    if (mode !== "track" || publicReport || !session.claimId) return;
    void loadReport(session.claimId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, session.claimId]);

  function updateSession(patch: Partial<WorkspaceSession>) {
    setSession((current) => ({ ...current, ...patch }));
  }

  async function waitForTx(hash: `0x${string}`, label: string) {
    if (!publicClient) throw new Error(`${networkLabel} RPC client is unavailable`);
    const next = await publicClient.waitForTransactionReceipt({ hash });
    if (next.status !== "success") throw new Error(`${label} reverted`);
    return next;
  }

  async function mintTestUsdt() {
    if (!address || !contracts.settlement || isMainnet) return;
    setStatus("Minting 10,000 TestUSDT…");
    const hash = await writeContractAsync({
      address: contracts.settlement,
      abi: erc20Abi,
      functionName: "mint",
      args: [address, parseUnits("10000", 6)],
      chainId: activeChain.id,
    });
    await waitForTx(hash, "TestUSDT faucet");
    setStatus("10,000 TestUSDT received.");
  }

  async function sendTestPayment() {
    if (!address || !publicClient || !contracts.settlement) return;
    const amount = parseUnits(expectedAmount || "0", 6);
    if (amount <= 0n) throw new Error("Enter the income amount first");
    const balance = await publicClient.readContract({
      address: contracts.settlement,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    });
    if (balance < amount) {
      setStatus("Minting TestUSDT for the payment proof…");
      const mintHash = await writeContractAsync({
        address: contracts.settlement,
        abi: erc20Abi,
        functionName: "mint",
        args: [address, parseUnits("10000", 6)],
        chainId: activeChain.id,
      });
      await waitForTx(mintHash, "TestUSDT mint");
    }
    setStatus("Sending a TestUSDT payment to this wallet…");
    const hash = await writeContractAsync({
      address: contracts.settlement,
      abi: erc20Abi,
      functionName: "transfer",
      args: [address, amount],
      chainId: activeChain.id,
    });
    await waitForTx(hash, "Test payment");
    setPaymentTxHash(hash);
    setStatus(`Payment recorded. Transaction ${compactId(hash)} will be used as proof.`);
  }

  function useSampleDocument() {
    const file = new File(
      [sampleIncomeText({ propertyName, amount: expectedAmount, periodKey, dueDate })],
      "sample-income.txt",
      { type: "text/plain" },
    );
    setLeaseFile(file);
    setStatus("Sample income document attached. You can still replace it with your own file.");
  }

  async function createPayerRequest() {
    if (!address) throw new Error("Connect the issuer wallet first");
    const file = leaseFile;
    if (!file) throw new Error("Attach the income document first");
    if (!isAddress(payerWallet)) throw new Error("Enter the payer’s wallet address");
    const documentHash = keccak256(new Uint8Array(await file.arrayBuffer()));
    const amountMinor = parseUnits(expectedAmount, 6).toString();
    setStatus("Authorizing the payer confirmation request…");
    const signature = await signMessageAsync({
      message: evidenceRequestMessage({
        issuer: address,
        payer: payerWallet,
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
      body: JSON.stringify({
        issuer: address,
        payer: payerWallet,
        periodKey,
        amountMinor,
        paidAt,
        documentHash,
        signature,
      }),
    });
    const result = await response.json() as { requestId?: string; confirmationUrl?: string; error?: string };
    if (!response.ok || !result.requestId || !result.confirmationUrl) {
      throw new Error(result.error || "Could not create payer request");
    }
    setPaymentRequestId(result.requestId);
    setConfirmationUrl(result.confirmationUrl);
    setConfirmationStatus("PENDING");
    setStatus("Payer link created. Share it, then check confirmation before reporting.");
  }

  async function checkPayerRequest() {
    if (!paymentRequestId) throw new Error("Create a payer request first");
    const response = await fetch(`/v1/evidence/requests/${paymentRequestId}`, { cache: "no-store" });
    const result = await response.json() as { status?: "PENDING" | "CONFIRMED"; error?: string };
    if (!response.ok || !result.status) throw new Error(result.error || "Could not check payer confirmation");
    setConfirmationStatus(result.status);
    setStatus(result.status === "CONFIRMED" ? "Payer confirmation received." : "Still waiting for the payer signature.");
  }

  async function reportRent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address || !publicClient || !contracts.vault || !contracts.settlement || !contracts.assetFactory || !contracts.assetRegistry) {
      throw new Error("The Testnet product is not configured yet");
    }
    const name = propertyName.trim();
    if (!name) throw new Error("Name the property");
    const file = leaseFile;
    if (!file) throw new Error("Attach an income document, or use the sample");
    const amount = parseUnits(expectedAmount, 6);
    if (amount <= 0n) throw new Error("Enter an income amount");
    if (proofMethod === "BOT_TRANSACTION" && !(isHex(paymentTxHash) && paymentTxHash.length === 66)) {
      throw new Error("Send a test payment or paste a TestUSDT transaction hash");
    }
    if (proofMethod === "COUNTERPARTY_SIGNATURE" && confirmationStatus !== "CONFIRMED") {
      throw new Error("The registered payer must confirm before you report");
    }

    const paymentProof = proofMethod === "BOT_TRANSACTION"
      ? { kind: "BOT_TRANSACTION" as const, txHash: paymentTxHash }
      : { kind: "COUNTERPARTY_SIGNATURE" as const, requestId: paymentRequestId };
    const proofReference = proofMethod === "BOT_TRANSACTION"
      ? `BOT_TRANSACTION:${paymentTxHash.toLowerCase()}`
      : `COUNTERPARTY_SIGNATURE:${paymentRequestId}`;
    const documentHash = keccak256(new Uint8Array(await file.arrayBuffer()));
    const assetTerms = {
      expectedAmountMinor: amount.toString(),
      dueDate,
      windowDays: Number(windowDays),
      amountToleranceMinor: parseUnits(tolerance || "0", 6).toString(),
      payerReferenceHash: zeroHash,
    };

    setStatus("Authorizing live evidence extraction…");
    const prepareSignature = await signMessageAsync({
      message: evidencePreparationMessage({
        requester: address,
        periodKey,
        proofReference,
        documentHash,
        chainId: activeChain.id,
      }),
    });
    const payload = new FormData();
    payload.set("document", file);
    payload.set("requester", address);
    payload.set("signature", prepareSignature);
    payload.set("periodKey", periodKey);
    payload.set("paymentProof", JSON.stringify(paymentProof));
    payload.set("assetTerms", JSON.stringify(assetTerms));
    setStatus("Reading the document and checking the payment proof…");
    const prepared = await fetch("/v1/evidence/prepare", { method: "POST", body: payload });
    const preparedBody = await prepared.json() as { evidenceBundle?: unknown; error?: string };
    if (!prepared.ok || !preparedBody.evidenceBundle) {
      throw new Error(preparedBody.error || "Evidence preparation failed");
    }
    const bundle = evidenceBundleSchema.parse(preparedBody.evidenceBundle);
    const serialized = JSON.stringify(bundle);
    const assetId = bytes32(name);
    const shareToken = await publicClient.readContract({
      address: contracts.assetRegistry,
      abi: assetRegistryAbi,
      functionName: "shareTokenOf",
      args: [assetId],
    });
    const termsHash = hashCanonical(bundle.assetTerms) as `0x${string}`;
    if (shareToken === zeroAddress) {
      setStatus("Registering the property and issuing your shares…");
      const createHash = await writeContractAsync({
        address: contracts.assetFactory,
        abi: assetFactoryAbi,
        functionName: "createAsset",
        args: [
          assetId,
          name,
          symbolFromName(name),
          bytes32("policy-v1"),
          termsHash,
          [getAddress(address)],
          [parseUnits("100", 18)],
        ],
        chainId: activeChain.id,
      });
      await waitForTx(createHash, "Property registration");
    } else {
      const registeredTerms = await publicClient.readContract({
        address: contracts.assetRegistry,
        abi: assetRegistryAbi,
        functionName: "termsHashOf",
        args: [assetId],
      });
      if (registeredTerms.toLowerCase() !== termsHash.toLowerCase()) {
        throw new Error("This property is already registered with different income terms");
      }
    }

    const balance = await publicClient.readContract({
      address: contracts.settlement,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    });
    if (balance < amount) {
      throw new Error("Not enough TestUSDT to escrow this claim. Use Get TestUSDT first.");
    }
    setStatus("Approving the TestUSDT escrow…");
    const approval = await writeContractAsync({
      address: contracts.settlement,
      abi: erc20Abi,
      functionName: "approve",
      args: [contracts.vault, amount],
      chainId: activeChain.id,
    });
    await waitForTx(approval, "USDT approval");
    setStatus("Submitting the escrowed claim…");
    const claimHash = await writeContractAsync({
      address: contracts.vault,
      abi: vaultAbi,
      functionName: "submitClaim",
      args: [assetId, bytes32(bundle.periodKey), amount, hashCanonical(bundle) as `0x${string}`],
      chainId: activeChain.id,
    });
    await waitForTx(claimHash, "Yield claim");
    const claimId = await publicClient.readContract({
      address: contracts.vault,
      abi: vaultAbi,
      functionName: "periodClaims",
      args: [assetId, bytes32(bundle.periodKey)],
    });
    setStatus("Authorizing the bonded verifier…");
    const verifySignature = await signMessageAsync({
      message: attestationRequestMessage(claimId, activeChain.id, networkLabel),
    });
    const processed = await fetch(`/v1/process/${claimId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requester: address, signature: verifySignature, evidenceBundle: bundle }),
    });
    if (!processed.ok) throw new Error(`Verifier service returned ${processed.status}`);
    const result = await processed.json() as ProcessResult;
    rememberEvidence(claimId, serialized);
    const nextSession: WorkspaceSession = {
      assetLabel: name,
      assetName: name,
      tokenSymbol: symbolFromName(name),
      periodKey,
      expectedAmount,
      evidenceBundle: serialized,
      claimId,
      attestationId: result.attestationId || "",
      attestationTx: result.transactionHash || "",
      attestedAt: result.attestationId ? Date.now() : 0,
      settled: false,
    };
    setSession(nextSession);
    setLookupClaimId(claimId);
    setPublicReport({
      reportHash: result.reportHash,
      attestationId: result.attestationId,
      attestationTransactionHash: result.transactionHash,
      report: result.report,
    });
    setMode("track");
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/app?mode=track");
    }
    setStatus(result.status === "INCONCLUSIVE"
      ? "The verifier could not decide. Escrow stays locked."
      : `Claim attested as ${result.outcome}. The challenge window is open.`);
  }

  async function loadReport(claimIdRaw: string, bundleRaw?: string) {
    const claimId = bytes32(claimIdRaw);
    const supplied = bundleRaw || session.evidenceBundle || recallEvidence(claimId);
    let evidenceBundle: EvidenceBundle | undefined;
    if (supplied) {
      try {
        evidenceBundle = evidenceBundleSchema.parse(JSON.parse(supplied));
      } catch {
        evidenceBundle = undefined;
      }
    }
    const apiBase = process.env.NEXT_PUBLIC_API_URL || window.location.origin;
    const response = await fetch(new URL(`/v1/reports/${claimId}`, apiBase), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ evidenceBundle }),
    });
    if (!response.ok) {
      setStatus(response.status === 404 ? "No report has been produced for that claim yet." : `Report service returned ${response.status}.`);
      return;
    }
    const report = await response.json() as PublicReport;
    setPublicReport(report);
    updateSession({
      claimId: report.report.claimId,
      attestationId: report.attestationId || session.attestationId,
      evidenceBundle: supplied || session.evidenceBundle,
    });
    setStatus("Verification report loaded.");
  }

  async function challengeAttestation() {
    if (!contracts.attestation || !session.attestationId) throw new Error("No attestation to challenge");
    if (!challengeBondBot) throw new Error("Challenge bond is not configured");
    setStatus("Submitting the challenge…");
    const hash = await writeContractAsync({
      address: contracts.attestation,
      abi: attestationAbi,
      functionName: "challenge",
      args: [bytes32(session.attestationId), bytes32(counterEvidence || "public-challenge")],
      value: parseEther(challengeBondBot),
      chainId: activeChain.id,
    });
    await waitForTx(hash, "Challenge");
    setStatus(`Challenge submitted with a ${challengeBondBot} ${nativeTokenLabel} bond.`);
  }

  async function finalizeAttestation() {
    if (!contracts.attestation || !session.attestationId) throw new Error("No attestation to finalize");
    setStatus("Finalizing the unchallenged attestation…");
    const hash = await writeContractAsync({
      address: contracts.attestation,
      abi: attestationAbi,
      functionName: "settle",
      args: [bytes32(session.attestationId)],
      chainId: activeChain.id,
    });
    await waitForTx(hash, "Settlement");
    updateSession({ settled: true });
    setStatus("Attestation settled. Holders can claim their share.");
  }

  async function overturnAttestation() {
    if (!contracts.attestation || !session.attestationId) throw new Error("No attestation to overturn");
    setStatus("Submitting the admin reversal…");
    const hash = await writeContractAsync({
      address: contracts.attestation,
      abi: attestationAbi,
      functionName: "resolve",
      args: [bytes32(session.attestationId), false, 2, 0n],
      chainId: activeChain.id,
    });
    await waitForTx(hash, "Resolver reversal");
    updateSession({ settled: true });
    setStatus("Admin reversal submitted. The claim is blocked and the verifier can be slashed.");
  }

  async function claimProceeds() {
    if (!contracts.vault || !session.claimId) throw new Error("No settled claim to collect");
    setStatus("Claiming your share of the verified escrow…");
    const hash = await writeContractAsync({
      address: contracts.vault,
      abi: vaultAbi,
      functionName: "claimYield",
      args: [bytes32(session.claimId)],
      chainId: activeChain.id,
    });
    await waitForTx(hash, "Yield claim");
    setStatus("Distribution submitted against the holder snapshot.");
  }

  async function offerShares(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address || !publicClient || !contracts.marketplace || !contracts.assetRegistry) return;
    const assetId = bytes32(session.assetName || propertyName);
    const shareAmount = parseUnits(listShares, 18);
    const pricePerShareMinor = parseUnits(listPrice, 6);
    const shareToken = await publicClient.readContract({
      address: contracts.assetRegistry,
      abi: assetRegistryAbi,
      functionName: "shareTokenOf",
      args: [assetId],
    });
    if (shareToken === zeroAddress) throw new Error("Report income first so the property exists");
    setStatus("Approving the marketplace to escrow shares…");
    const approval = await writeContractAsync({
      address: shareToken,
      abi: erc20Abi,
      functionName: "approve",
      args: [contracts.marketplace, shareAmount],
      chainId: activeChain.id,
    });
    await waitForTx(approval, "Share approval");
    setStatus("Publishing the offering…");
    const listingHash = await writeContractAsync({
      address: contracts.marketplace,
      abi: marketplaceAbi,
      functionName: "createListing",
      args: [assetId, shareAmount, pricePerShareMinor, session.assetName || propertyName],
      chainId: activeChain.id,
    });
    await waitForTx(listingHash, "Marketplace listing");
    setStatus("Offering is live on the marketplace.");
  }

  async function stakeVerifier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!contracts.staking) return;
    setStatus(`Staking ${stakeAmount} ${nativeTokenLabel}…`);
    const hash = await writeContractAsync({
      address: contracts.staking,
      abi: stakingAbi,
      functionName: "stake",
      value: parseEther(stakeAmount),
      chainId: activeChain.id,
    });
    await waitForTx(hash, "Verifier stake");
    setStatus("Stake submitted. It becomes slashable when an attestation locks it.");
  }

  async function safelyRun(action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      setStatus(error instanceof Error ? error.message.split("\n")[0] : "The action could not be completed.");
    }
  }

  return (
    <main className="app-page">
      <SiteNav active={mode === "track" ? "track" : "issue"} />

      <section className="product-shell shell">
        <div className="product-heading">
          <div>
            <p className="kicker">{mode === "track" ? "Track a claim" : "Report this month’s income"}</p>
            <h1>{mode === "track" ? "See the verdict." : "Prove the yield, then get paid."}</h1>
            <p className="hero-copy">
              {mode === "track"
                ? "A deterministic report, a challenge window, and the next money action. No console."
                : "You declare the income. The document is extracted separately. A payment proof has to match, or nothing is distributed."}
            </p>
          </div>
          <div className="mode-switch" role="tablist" aria-label="Workspace">
            <button type="button" className={mode === "issue" ? "active" : ""} onClick={() => setMode("issue")}>Report</button>
            <button type="button" className={mode === "track" ? "active" : ""} onClick={() => setMode("track")}>Track</button>
          </div>
        </div>

        <div className="setup-strip">
          {!isConnected && (
            <div className="guard">
              <Unplug size={18} />
              <span><strong>Wallet required</strong>Connect an injected wallet to continue.</span>
              <button type="button" disabled={!connector || isConnecting} onClick={() => connector && connect({ connector })}>
                {isConnecting ? "Connecting…" : "Connect"}
              </button>
            </div>
          )}
          {isConnected && !networkReady && (
            <div className="guard warning">
              <ShieldCheck size={18} />
              <span><strong>Wrong network</strong>Switch to {networkLabel} (chain {activeChain.id}).</span>
              <button type="button" onClick={() => switchChain({ chainId: activeChain.id })}>{isSwitching ? "Switching…" : "Switch network"}</button>
            </div>
          )}
          {isConnected && networkReady && !isConfigured && (
            <div className="guard warning">
              <Bot size={18} />
              <span><strong>Deployment pending</strong>{networkLabel} addresses are not configured in this build.</span>
            </div>
          )}
          {isConnected && networkReady && isConfigured && !writesEnabled && (
            <div className="guard warning">
              <ShieldCheck size={18} />
              <span><strong>Writes locked</strong>This build is read-only until Mainnet writes are enabled.</span>
            </div>
          )}
        </div>

        {mode === "issue" ? (
          <form className="report-form" onSubmit={(event) => void safelyRun(() => reportRent(event))}>
            <div className="field-grid">
              <label>Property name<input value={propertyName} onChange={(event) => setPropertyName(event.target.value)} placeholder="Lekki income property" required /></label>
              <label>Period<input type="month" value={periodKey} onChange={(event) => {
                const next = event.target.value;
                setPeriodKey(next);
                setDueDate(firstOfPeriod(next));
                setPaidAt(firstOfPeriod(next));
              }} required /></label>
            </div>
            <div className="field-grid">
              <label>Income amount <span>USDT</span><input type="number" min="0.000001" step="0.000001" value={expectedAmount} onChange={(event) => setExpectedAmount(event.target.value)} required /></label>
              <label>Due date<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required /></label>
            </div>

            <div className="lease-block">
              <label>Income document
                <input
                  type="file"
                  accept="application/pdf,text/plain"
                  onChange={(event) => setLeaseFile(event.target.files?.[0] || undefined)}
                />
              </label>
              <div className="sample-actions">
                <button type="button" className="secondary-action" onClick={useSampleDocument}><FileText size={15} /> Use sample document</button>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => downloadText("sample-income.txt", sampleIncomeText({ propertyName, amount: expectedAmount, periodKey, dueDate }))}
                >
                  Download sample
                </button>
                {leaseFile && <small>{leaseFile.name}</small>}
              </div>
              <p className="bond-note">You declare the income above. The document is read separately. If they disagree, the claim fails.</p>
            </div>

            <fieldset className="proof-methods">
              <legend>How was this income paid?</legend>
              <button type="button" aria-pressed={proofMethod === "BOT_TRANSACTION"} className={proofMethod === "BOT_TRANSACTION" ? "active" : ""} onClick={() => setProofMethod("BOT_TRANSACTION")}>
                <Fingerprint /><span><strong>Testnet payment</strong><small>Send or paste a TestUSDT transfer</small></span>
              </button>
              <button type="button" aria-pressed={proofMethod === "COUNTERPARTY_SIGNATURE"} className={proofMethod === "COUNTERPARTY_SIGNATURE" ? "active" : ""} onClick={() => setProofMethod("COUNTERPARTY_SIGNATURE")}>
                <Link2 /><span><strong>Payer confirmation</strong><small>Send a signature link</small></span>
              </button>
            </fieldset>

            {proofMethod === "BOT_TRANSACTION" ? (
              <div className="payment-block">
                <button type="button" className="secondary-action" disabled={!canWrite || isPending} onClick={() => void safelyRun(sendTestPayment)}>
                  <CircleDollarSign size={16} /> Send a test payment
                </button>
                <label>Or paste a TestUSDT transaction
                  <input value={paymentTxHash} onChange={(event) => setPaymentTxHash(event.target.value)} placeholder="0x… transfer to this wallet" />
                </label>
              </div>
            ) : (
              <div className="payer-request">
                <div className="field-grid">
                  <label>Payer wallet<input value={payerWallet} onChange={(event) => setPayerWallet(event.target.value)} placeholder="0x…" required={proofMethod === "COUNTERPARTY_SIGNATURE"} /></label>
                  <label>Payment date<input type="date" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} required={proofMethod === "COUNTERPARTY_SIGNATURE"} /></label>
                </div>
                <button className="secondary-action" type="button" onClick={() => void safelyRun(createPayerRequest)}><Link2 size={16} /> Create payer link</button>
                {confirmationUrl && (
                  <div className="share-link">
                    <span><b>{confirmationStatus}</b><code>{confirmationUrl}</code></span>
                    <button type="button" aria-label="Copy payer link" onClick={() => void navigator.clipboard.writeText(confirmationUrl)}><Copy size={15} /></button>
                    <a href={confirmationUrl} target="_blank" rel="noreferrer">Open <ArrowUpRight size={14} /></a>
                    <button type="button" onClick={() => void safelyRun(checkPayerRequest)}>Check status</button>
                  </div>
                )}
              </div>
            )}

            <details className="advanced-block">
              <summary>Advanced terms</summary>
              <div className="field-grid">
                <label>Allowed window <span>days</span><input type="number" min="0" max="60" value={windowDays} onChange={(event) => setWindowDays(event.target.value)} /></label>
                <label>Amount tolerance <span>USDT</span><input type="number" min="0" step="0.000001" value={tolerance} onChange={(event) => setTolerance(event.target.value)} /></label>
              </div>
            </details>

            <div className="signing-preview">
              <p>Your wallet will ask you to:</p>
              <ol>{signingSteps.map((step) => <li key={step}>{step}</li>)}</ol>
            </div>

            <label className="consent">
              <input type="checkbox" required />
              I have permission to send this document’s extracted text to DeepSeek and store the original privately.
            </label>
            <button className="submit" disabled={!canWrite || isPending || (proofMethod === "COUNTERPARTY_SIGNATURE" && confirmationStatus !== "CONFIRMED")}>
              {isPending ? <LoaderCircle className="spin" /> : <Fingerprint />}
              Report this month’s income
            </button>
          </form>
        ) : (
          <div className="tracker">
            <form className="lookup-row" onSubmit={(event) => { event.preventDefault(); void safelyRun(() => loadReport(lookupClaimId)); }}>
              <label>Load a claim
                <input value={lookupClaimId} onChange={(event) => setLookupClaimId(event.target.value)} placeholder="Uses your last report if you leave this blank" />
              </label>
              <button className="secondary-action" type="submit">Load report</button>
            </form>

            {publicReport ? (
              <article className={`tracker-report ${publicReport.report.outcome.toLowerCase()}`}>
                <header>
                  <p className="kicker">{session.assetName || "Reported property"} · {periodLabel(publicReport.report.periodKey || session.periodKey)}</p>
                  <h2>{publicReport.report.outcome === "VERIFIED" ? "Approved" : publicReport.report.outcome === "BLOCKED" ? "Blocked" : "Inconclusive"}</h2>
                  <p>{outcomeCopy(publicReport.report.outcome)}</p>
                  {publicReport.report.outcome === "VERIFIED" && (
                    <p className="verified-amount">{formatAmount(publicReport.report.verifiedAmountMinor)} USDT escrowed</p>
                  )}
                </header>
                {windowOpen && (
                  <p className="countdown">Challenge window {formatCountdown(remainingSeconds)}</p>
                )}
                <ul className="human-rules">
                  {publicReport.report.ruleResults.map((rule) => (
                    <li key={rule.ruleId}>
                      <b className={rule.status.toLowerCase()}>{rule.status}</b>
                      <span>
                        <strong>{RULE_COPY[rule.ruleId] || rule.ruleId.replaceAll("_", " ").toLowerCase()}</strong>
                        <small>{rule.message}</small>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="limitation">{publicReport.report.limitations[0]}</p>
                <div className="report-actions">
                  {windowOpen && (
                    <button type="button" disabled={!canWrite || isPending} onClick={() => void safelyRun(challengeAttestation)}>
                      <Gavel size={15} /> Challenge
                    </button>
                  )}
                  {windowClosed && !session.settled && publicReport.report.outcome !== "INCONCLUSIVE" && (
                    <button type="button" disabled={!canWrite || isPending} onClick={() => void safelyRun(finalizeAttestation)}>
                      <Scale size={15} /> Finalize
                    </button>
                  )}
                  {session.settled && publicReport.report.outcome === "VERIFIED" && (
                    <button type="button" disabled={!canWrite || isPending} onClick={() => void safelyRun(claimProceeds)}>
                      <CircleDollarSign size={15} /> Claim your share
                    </button>
                  )}
                </div>
                <details className="proofs-block">
                  <summary>Proofs</summary>
                  <div className="report-identifiers">
                    <div><span>Claim</span><code>{publicReport.report.claimId}</code><button type="button" onClick={() => void navigator.clipboard.writeText(publicReport.report.claimId)}>Copy</button></div>
                    {publicReport.attestationId && <div><span>Attestation</span><code>{publicReport.attestationId}</code><button type="button" onClick={() => void navigator.clipboard.writeText(publicReport.attestationId!)}>Copy</button></div>}
                    <div><span>Report</span><code>{publicReport.reportHash}</code><button type="button" onClick={() => void navigator.clipboard.writeText(publicReport.reportHash)}>Copy</button></div>
                  </div>
                  <div className="proof-links">
                    {publicReport.attestationTransactionHash && (
                      <a href={`${activeChain.blockExplorers.default.url}/tx/${publicReport.attestationTransactionHash}`} target="_blank" rel="noreferrer">
                        Attestation tx <ArrowUpRight size={13} />
                      </a>
                    )}
                    {session.attestationTx && session.attestationTx !== publicReport.attestationTransactionHash && (
                      <a href={`${activeChain.blockExplorers.default.url}/tx/${session.attestationTx}`} target="_blank" rel="noreferrer">
                        Saved tx <ArrowUpRight size={13} />
                      </a>
                    )}
                  </div>
                </details>
              </article>
            ) : (
              <div className="empty-track">
                <p>No report loaded yet. Report this month’s income, or paste a claim ID above.</p>
                <button type="button" className="secondary-action" onClick={() => setMode("issue")}>Report income</button>
              </div>
            )}

            <details className="advanced-block">
              <summary>Offer shares</summary>
              <form onSubmit={(event) => void safelyRun(() => offerShares(event))}>
                <p className="bond-note">Optional. List some of your 100 issuer shares on the public marketplace.</p>
                <div className="field-grid">
                  <label>Shares to offer<input type="number" min="0.000001" step="0.000001" value={listShares} onChange={(event) => setListShares(event.target.value)} /></label>
                  <label>Price per share <span>TestUSDT</span><input type="number" min="0.000001" step="0.000001" value={listPrice} onChange={(event) => setListPrice(event.target.value)} /></label>
                </div>
                <button className="secondary-action" disabled={!canWrite || isPending} type="submit"><Store size={15} /> Publish offering</button>
              </form>
            </details>

            <details className="advanced-block">
              <summary>Advanced</summary>
              <form onSubmit={(event) => void safelyRun(() => stakeVerifier(event))}>
                <label>Stake as verifier <span>{nativeTokenLabel}</span>
                  <div className="amount-input">
                    <input type="number" min="0.001" step="0.001" value={stakeAmount} onChange={(event) => setStakeAmount(event.target.value)} />
                    <b>{nativeTokenLabel}</b>
                  </div>
                </label>
                <button className="secondary-action" disabled={!canWrite || isPending} type="submit"><LockKeyhole size={15} /> Stake</button>
              </form>
              <label>Counter-evidence note<input value={counterEvidence} onChange={(event) => setCounterEvidence(event.target.value)} /></label>
              <p className="bond-note">Admin only: overturn a challenged false approval.</p>
              <button className="secondary-action" type="button" disabled={!canWrite || isPending} onClick={() => void safelyRun(overturnAttestation)}>
                <Scale size={15} /> Overturn as admin
              </button>
            </details>
          </div>
        )}

        <div className="status-line">
          <span className={receipt.isSuccess ? "success-dot" : ""} />
          <p>{status}</p>
          {txUrl && <a href={txUrl} target="_blank" rel="noreferrer">View tx <ArrowUpRight size={13} /></a>}
        </div>
      </section>
    </main>
  );
}
