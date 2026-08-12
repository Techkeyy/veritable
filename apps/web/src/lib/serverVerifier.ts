import { evaluateClaim, hashCanonical } from "@veritable/policy";
import type { PaymentRecord, VerificationInput } from "@veritable/schemas";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  stringToHex,
  verifyMessage,
  zeroHash,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { botTestnet, contracts } from "./chain";

const FIXTURE_NOW = new Date("2026-08-03T00:00:00.000Z");
const PAYER_REFERENCE = `0x${"33".repeat(32)}` as Hex;
const PERIOD_KEY = "2026-08";
const assetTerms = {
  expectedAmountMinor: "2000000000",
  dueDate: "2026-08-01",
  windowDays: 5,
  amountToleranceMinor: "0",
  payerReferenceHash: PAYER_REFERENCE,
} as const;

const evidenceScenarios = {
  [keccak256(stringToHex("evidence:exact-payment"))]: "rent-paid-exact",
  [keccak256(stringToHex("evidence:underpaid"))]: "rent-underpaid",
  [keccak256(stringToHex("evidence:unavailable"))]: "unavailable",
} as const;

const vaultServerAbi = [
  {
    type: "function",
    name: "claimForAttestation",
    stateMutability: "view",
    inputs: [{ name: "claimId", type: "bytes32" }],
    outputs: [
      { name: "assetId", type: "bytes32" },
      { name: "periodKey", type: "bytes32" },
      { name: "escrowedAmount", type: "uint256" },
      { name: "evidenceRoot", type: "bytes32" },
      { name: "status", type: "uint8" },
    ],
  },
] as const;

const attestationServerAbi = [
  {
    type: "function",
    name: "claimAttestations",
    stateMutability: "view",
    inputs: [{ name: "claimId", type: "bytes32" }],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "nonces",
    stateMutability: "view",
    inputs: [{ name: "verifier", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "submitAttestation",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "data",
        type: "tuple",
        components: [
          { name: "claimId", type: "bytes32" },
          { name: "assetId", type: "bytes32" },
          { name: "periodKey", type: "bytes32" },
          { name: "claimedAmount", type: "uint256" },
          { name: "verifiedAmount", type: "uint256" },
          { name: "outcome", type: "uint8" },
          { name: "evidenceRoot", type: "bytes32" },
          { name: "reportHash", type: "bytes32" },
          { name: "policyHash", type: "bytes32" },
          { name: "termsHash", type: "bytes32" },
          { name: "modelRunHash", type: "bytes32" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      { name: "signature", type: "bytes" },
    ],
    outputs: [{ name: "attestationId", type: "bytes32" }],
  },
] as const;

function requiredAddress(value: string | undefined, label: string): Address {
  if (!value) throw new Error(`${label} is not configured`);
  return value as Address;
}

function requiredPrivateKey(value: string | undefined, label: string): Hex {
  if (!value || !/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`${label} is not configured`);
  return value as Hex;
}

function unsignedPayment(scenario: (typeof evidenceScenarios)[keyof typeof evidenceScenarios]) {
  const common = {
    source: "verifi-sandbox-rail",
    issuedAt: FIXTURE_NOW.toISOString(),
    expiresAt: new Date(FIXTURE_NOW.getTime() + 30 * 86_400_000).toISOString(),
  };
  const raw = scenario === "rent-paid-exact"
    ? { ...common, status: "FOUND" as const, amountMinor: "2000000000", paidAt: "2026-08-02", payerReferenceHash: PAYER_REFERENCE }
    : scenario === "rent-underpaid"
      ? { ...common, status: "FOUND" as const, amountMinor: "1200000000", paidAt: "2026-08-02", payerReferenceHash: PAYER_REFERENCE }
      : { ...common, status: "UNAVAILABLE" as const };
  return { ...raw, payloadHash: hashCanonical(raw) };
}

export async function buildPublicVerification(claimId: Hex) {
  const vault = requiredAddress(contracts.vault, "YieldVault");
  const registry = requiredAddress(contracts.attestation, "AttestationRegistry");
  const rpcUrl = process.env.BOT_TESTNET_RPC_URL || process.env.NEXT_PUBLIC_BOT_TESTNET_RPC_URL || "https://rpc.bohr.life";
  const publicClient = createPublicClient({ chain: botTestnet, transport: http(rpcUrl) });
  const [claim, existingAttestationId] = await Promise.all([
    publicClient.readContract({ address: vault, abi: vaultServerAbi, functionName: "claimForAttestation", args: [claimId] }),
    publicClient.readContract({ address: registry, abi: attestationServerAbi, functionName: "claimAttestations", args: [claimId] }),
  ]);
  const [assetId, periodKeyHash, amount, evidenceRoot, status] = claim;
  if (status === 0) throw new Error("Claim does not exist on BOT Testnet");
  if (periodKeyHash.toLowerCase() !== keccak256(stringToHex(PERIOD_KEY)).toLowerCase()) {
    throw new Error("This testnet verifier supports the published 2026-08 sandbox period");
  }
  const scenario = evidenceScenarios[evidenceRoot.toLowerCase() as keyof typeof evidenceScenarios];
  if (!scenario) throw new Error("Evidence root is not a published sandbox fixture");

  const evidenceKey = requiredPrivateKey(process.env.EVIDENCE_SIGNER_PRIVATE_KEY, "Evidence signer");
  const evidenceAccount = privateKeyToAccount(evidenceKey);
  const unsigned = unsignedPayment(scenario);
  const signature = await evidenceAccount.signMessage({ message: { raw: unsigned.payloadHash as Hex } });
  const signatureValid = await verifyMessage({
    address: evidenceAccount.address,
    message: { raw: unsigned.payloadHash as Hex },
    signature,
  });
  const paymentRecord: PaymentRecord = { ...unsigned, signatureValid };
  const input: VerificationInput = {
    claimId,
    assetId,
    periodKey: PERIOD_KEY,
    claimedAmountMinor: amount.toString(),
    currency: "USDT",
    assetTerms,
    documents: [{
      id: "lease-2026-demo",
      contentHash: keccak256(stringToHex("redacted-demo-lease-v1")),
      mediaType: "application/pdf",
      kind: "LEASE",
      extractedText: "Redacted sandbox lease: monthly rent 2,000 USDT; due on day 1.",
    }],
    paymentRecords: [paymentRecord],
    evidenceRoot,
  };
  const report = evaluateClaim(input, FIXTURE_NOW);
  return {
    publicClient,
    registry,
    claim: { claimId, assetId, periodKeyHash, amount, evidenceRoot, status },
    existingAttestationId,
    report,
    reportHash: hashCanonical(report) as Hex,
  };
}

export async function processPublicClaim(claimId: Hex) {
  const verification = await buildPublicVerification(claimId);
  if (verification.report.outcome === "INCONCLUSIVE") {
    return { ...verification, transactionHash: undefined };
  }
  if (verification.existingAttestationId !== zeroHash) {
    return { ...verification, transactionHash: undefined };
  }
  const verifierKey = requiredPrivateKey(process.env.VERIFIER_PRIVATE_KEY, "Verifier");
  const account = privateKeyToAccount(verifierKey);
  const walletClient = createWalletClient({ chain: botTestnet, transport: http(process.env.BOT_TESTNET_RPC_URL || "https://rpc.bohr.life"), account });
  const [nonce, block] = await Promise.all([
    verification.publicClient.readContract({ address: verification.registry, abi: attestationServerAbi, functionName: "nonces", args: [account.address] }),
    verification.publicClient.getBlock(),
  ]);
  const data = {
    claimId,
    assetId: verification.claim.assetId,
    periodKey: verification.claim.periodKeyHash,
    claimedAmount: verification.claim.amount,
    verifiedAmount: BigInt(verification.report.verifiedAmountMinor),
    outcome: verification.report.outcome === "VERIFIED" ? 1 : 2,
    evidenceRoot: verification.claim.evidenceRoot,
    reportHash: verification.reportHash,
    policyHash: keccak256(stringToHex("policy-v1")),
    termsHash: hashCanonical(assetTerms) as Hex,
    modelRunHash: keccak256(stringToHex("deterministic-extractor-v1")),
    nonce,
    deadline: block.timestamp + 900n,
  } as const;
  const signature = await walletClient.signTypedData({
    account,
    domain: { name: "VeriFi Attestation Registry", version: "1", chainId: botTestnet.id, verifyingContract: verification.registry },
    types: {
      Attestation: [
        { name: "claimId", type: "bytes32" }, { name: "assetId", type: "bytes32" },
        { name: "periodKey", type: "bytes32" }, { name: "claimedAmount", type: "uint256" },
        { name: "verifiedAmount", type: "uint256" }, { name: "outcome", type: "uint8" },
        { name: "evidenceRoot", type: "bytes32" }, { name: "reportHash", type: "bytes32" },
        { name: "policyHash", type: "bytes32" }, { name: "termsHash", type: "bytes32" },
        { name: "modelRunHash", type: "bytes32" }, { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "Attestation",
    message: data,
  });
  const { request } = await verification.publicClient.simulateContract({
    account,
    address: verification.registry,
    abi: attestationServerAbi,
    functionName: "submitAttestation",
    args: [data, signature],
  });
  const transactionHash = await walletClient.writeContract(request);
  const receipt = await verification.publicClient.waitForTransactionReceipt({ hash: transactionHash });
  if (receipt.status !== "success") throw new Error("Attestation transaction reverted");
  return { ...verification, transactionHash };
}
