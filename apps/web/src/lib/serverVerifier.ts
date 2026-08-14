import { evaluateClaim, hashCanonical } from "@veritable/policy";
import {
  evidenceBundleSchema,
  type EvidenceBundle,
  type PaymentRecord,
  type VerificationInput,
} from "@veritable/schemas";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  isHex,
  keccak256,
  stringToHex,
  verifyMessage,
  zeroHash,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { activeChain, contracts, networkLabel } from "./chain";
import { envelopeFromBotTransaction, payerReferenceHash } from "./paymentProofs";

const vaultServerAbi = [
  { type: "function", name: "claimForAttestation", stateMutability: "view", inputs: [{ name: "claimId", type: "bytes32" }], outputs: [
    { name: "assetId", type: "bytes32" }, { name: "periodKey", type: "bytes32" },
    { name: "escrowedAmount", type: "uint256" }, { name: "evidenceRoot", type: "bytes32" }, { name: "status", type: "uint8" },
  ] },
  { type: "function", name: "getClaim", stateMutability: "view", inputs: [{ name: "claimId", type: "bytes32" }], outputs: [{ name: "claim", type: "tuple", components: [
    { name: "assetId", type: "bytes32" }, { name: "periodKey", type: "bytes32" }, { name: "evidenceRoot", type: "bytes32" },
    { name: "issuer", type: "address" }, { name: "shareToken", type: "address" }, { name: "escrowedAmount", type: "uint256" },
    { name: "verifiedAmount", type: "uint256" }, { name: "snapshotId", type: "uint256" }, { name: "totalShares", type: "uint256" },
    { name: "resolvedAt", type: "uint64" }, { name: "status", type: "uint8" },
  ] }] },
] as const;

const assetRegistryServerAbi = [
  { type: "function", name: "termsHashOf", stateMutability: "view", inputs: [{ name: "assetId", type: "bytes32" }], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "policyHashOf", stateMutability: "view", inputs: [{ name: "assetId", type: "bytes32" }], outputs: [{ type: "bytes32" }] },
] as const;

const attestationServerAbi = [
  { type: "function", name: "claimAttestations", stateMutability: "view", inputs: [{ name: "claimId", type: "bytes32" }], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "nonces", stateMutability: "view", inputs: [{ name: "verifier", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "submitAttestation", stateMutability: "nonpayable", inputs: [
    { name: "data", type: "tuple", components: [
      { name: "claimId", type: "bytes32" }, { name: "assetId", type: "bytes32" }, { name: "periodKey", type: "bytes32" },
      { name: "claimedAmount", type: "uint256" }, { name: "verifiedAmount", type: "uint256" }, { name: "outcome", type: "uint8" },
      { name: "evidenceRoot", type: "bytes32" }, { name: "reportHash", type: "bytes32" }, { name: "policyHash", type: "bytes32" },
      { name: "termsHash", type: "bytes32" }, { name: "modelRunHash", type: "bytes32" }, { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ] }, { name: "signature", type: "bytes" },
  ], outputs: [{ name: "attestationId", type: "bytes32" }] },
] as const;

function requiredAddress(value: string | undefined, label: string): Address {
  if (!value) throw new Error(`${label} is not configured`);
  return getAddress(value);
}

function requiredPrivateKey(value: string | undefined, label: string): Hex {
  if (!value || !/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`${label} is not configured`);
  return value as Hex;
}

async function validatePayment(bundle: EvidenceBundle, expectedRecipient: Address): Promise<PaymentRecord> {
  const envelope = bundle.paymentEnvelope;
  const unsigned = { ...envelope.record } as Record<string, unknown>;
  delete unsigned.payloadHash;
  const hashMatches = hashCanonical(unsigned).toLowerCase() === envelope.record.payloadHash.toLowerCase();
  let signatureValid = false;
  if (envelope.record.source.startsWith("BOT_CHAIN_TX:")) {
    const txHash = envelope.record.source.slice("BOT_CHAIN_TX:".length);
    if (isHex(txHash) && txHash.length === 66 && envelope.record.amountMinor) {
      const reconstructed = await envelopeFromBotTransaction({
        txHash: txHash as Hex,
        recipient: expectedRecipient,
        expectedAmountMinor: envelope.record.amountMinor,
      });
      signatureValid = hashMatches
        && reconstructed.signer.toLowerCase() === envelope.signer.toLowerCase()
        && hashCanonical(reconstructed.record).toLowerCase() === hashCanonical(envelope.record).toLowerCase();
    }
  } else if (envelope.record.source.startsWith("COUNTERPARTY_ATTESTATION:")) {
    const [, requestId, sourceIssuer, sourcePeriod, sourceDocumentHash, sourceChainId] = envelope.record.source.split(":");
    signatureValid = Boolean(requestId)
      && sourceIssuer?.toLowerCase() === expectedRecipient.toLowerCase()
      && sourcePeriod === bundle.periodKey
      && sourceDocumentHash?.toLowerCase() === bundle.documents[0]?.contentHash.toLowerCase()
      && sourceChainId === String(activeChain.id)
      && hashMatches
      && envelope.record.payerReferenceHash?.toLowerCase() === payerReferenceHash(envelope.signer as Address).toLowerCase()
      && await verifyMessage({
        address: envelope.signer as Address,
        message: { raw: envelope.record.payloadHash as Hex },
        signature: envelope.signature as Hex,
      });
  } else {
    const expectedSigner = requiredAddress(
      activeChain.id === 677 ? process.env.MAINNET_EVIDENCE_SIGNER_ADDRESS : process.env.EVIDENCE_SIGNER_ADDRESS,
      "Evidence signer address",
    );
    signatureValid = hashMatches
      && envelope.signer.toLowerCase() === expectedSigner.toLowerCase()
      && await verifyMessage({
        address: envelope.signer as Address,
        message: { raw: envelope.record.payloadHash as Hex },
        signature: envelope.signature as Hex,
      });
  }
  return { ...envelope.record, signatureValid };
}

export async function buildPublicVerification(claimId: Hex, rawBundle: unknown) {
  const bundle = evidenceBundleSchema.parse(rawBundle);
  const vault = requiredAddress(contracts.vault, "YieldVault");
  const registry = requiredAddress(contracts.attestation, "AttestationRegistry");
  const assetRegistry = requiredAddress(contracts.assetRegistry, "AssetRegistry");
  const rpcUrl = activeChain.id === 677
    ? process.env.BOT_MAINNET_RPC_URL || process.env.NEXT_PUBLIC_BOT_MAINNET_RPC_URL || "https://rpc.botchain.ai"
    : process.env.BOT_TESTNET_RPC_URL || process.env.NEXT_PUBLIC_BOT_TESTNET_RPC_URL || "https://rpc.bohr.life";
  const publicClient = createPublicClient({ chain: activeChain, transport: http(rpcUrl) });
  const [claim, fullClaim, existingAttestationId] = await Promise.all([
    publicClient.readContract({ address: vault, abi: vaultServerAbi, functionName: "claimForAttestation", args: [claimId] }),
    publicClient.readContract({ address: vault, abi: vaultServerAbi, functionName: "getClaim", args: [claimId] }),
    publicClient.readContract({ address: registry, abi: attestationServerAbi, functionName: "claimAttestations", args: [claimId] }),
  ]);
  const [assetId, periodKeyHash, amount, evidenceRoot, status] = claim;
  if (status === 0) throw new Error(`Claim does not exist on ${networkLabel}`);
  const [registeredTermsHash, registeredPolicyHash] = await Promise.all([
    publicClient.readContract({ address: assetRegistry, abi: assetRegistryServerAbi, functionName: "termsHashOf", args: [assetId] }),
    publicClient.readContract({ address: assetRegistry, abi: assetRegistryServerAbi, functionName: "policyHashOf", args: [assetId] }),
  ]);
  if (keccak256(stringToHex(bundle.periodKey)).toLowerCase() !== periodKeyHash.toLowerCase()) throw new Error("Evidence period does not match the onchain claim");
  if (hashCanonical(bundle).toLowerCase() !== evidenceRoot.toLowerCase()) throw new Error("Evidence bundle does not match the onchain evidence commitment");
  if (hashCanonical(bundle.assetTerms).toLowerCase() !== registeredTermsHash.toLowerCase()) throw new Error("Evidence terms do not match the asset's onchain terms commitment");
  const policyHash = keccak256(stringToHex("policy-v1"));
  if (registeredPolicyHash.toLowerCase() !== policyHash.toLowerCase()) throw new Error("Asset is not registered for policy-v1");
  const paymentRecord = await validatePayment(bundle, fullClaim.issuer);
  const input: VerificationInput = {
    claimId,
    assetId,
    periodKey: bundle.periodKey,
    claimedAmountMinor: amount.toString(),
    currency: "USDT",
    assetTerms: bundle.assetTerms,
    documents: bundle.documents,
    paymentRecords: [paymentRecord],
    evidenceRoot,
    extractionRequired: bundle.documents.some((document) => document.id.startsWith("deepseek:")),
  };
  const report = evaluateClaim(input, new Date());
  return {
    bundle, publicClient, registry,
    claim: { claimId, assetId, periodKeyHash, amount, evidenceRoot, status, issuer: fullClaim.issuer },
    existingAttestationId,
    report,
    reportHash: hashCanonical(report) as Hex,
    policyHash,
  };
}

export async function processPublicClaim(
  claimId: Hex,
  requester: Address,
  rawBundle: unknown,
  beforeAttestation?: (verification: Awaited<ReturnType<typeof buildPublicVerification>>) => Promise<void>,
) {
  if (activeChain.id === 677 && process.env.ALLOW_MAINNET !== "true") throw new Error("Mainnet hosted verifier is locked until ALLOW_MAINNET=true after explicit migration authorization");
  const verification = await buildPublicVerification(claimId, rawBundle);
  if (verification.claim.issuer.toLowerCase() !== requester.toLowerCase()) throw new Error("Only the onchain claim issuer may request its attestation");
  await beforeAttestation?.(verification);
  if (verification.report.outcome === "INCONCLUSIVE") return { ...verification, transactionHash: undefined };
  if (verification.existingAttestationId !== zeroHash) return { ...verification, transactionHash: undefined };
  const verifierKey = requiredPrivateKey(activeChain.id === 677 ? process.env.MAINNET_VERIFIER_PRIVATE_KEY : process.env.VERIFIER_PRIVATE_KEY, "Verifier");
  const account = privateKeyToAccount(verifierKey);
  const rpcUrl = activeChain.id === 677 ? process.env.BOT_MAINNET_RPC_URL || "https://rpc.botchain.ai" : process.env.BOT_TESTNET_RPC_URL || "https://rpc.bohr.life";
  const walletClient = createWalletClient({ chain: activeChain, transport: http(rpcUrl), account });
  const [nonce, block] = await Promise.all([
    verification.publicClient.readContract({ address: verification.registry, abi: attestationServerAbi, functionName: "nonces", args: [account.address] }),
    verification.publicClient.getBlock(),
  ]);
  const data = {
    claimId, assetId: verification.claim.assetId, periodKey: verification.claim.periodKeyHash,
    claimedAmount: verification.claim.amount, verifiedAmount: BigInt(verification.report.verifiedAmountMinor),
    outcome: verification.report.outcome === "VERIFIED" ? 1 : 2,
    evidenceRoot: verification.claim.evidenceRoot, reportHash: verification.reportHash,
    policyHash: verification.policyHash, termsHash: verification.report.termsHash as Hex,
    modelRunHash: verification.bundle.modelRunHash as Hex, nonce, deadline: block.timestamp + 900n,
  } as const;
  const signature = await walletClient.signTypedData({
    account,
    domain: { name: activeChain.id === 968 ? "VeriFi Attestation Registry" : "Veritable Attestation Registry", version: "1", chainId: activeChain.id, verifyingContract: verification.registry },
    types: { Attestation: [
      { name: "claimId", type: "bytes32" }, { name: "assetId", type: "bytes32" }, { name: "periodKey", type: "bytes32" },
      { name: "claimedAmount", type: "uint256" }, { name: "verifiedAmount", type: "uint256" }, { name: "outcome", type: "uint8" },
      { name: "evidenceRoot", type: "bytes32" }, { name: "reportHash", type: "bytes32" }, { name: "policyHash", type: "bytes32" },
      { name: "termsHash", type: "bytes32" }, { name: "modelRunHash", type: "bytes32" }, { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ] },
    primaryType: "Attestation",
    message: data,
  });
  const { request } = await verification.publicClient.simulateContract({ account, address: verification.registry, abi: attestationServerAbi, functionName: "submitAttestation", args: [data, signature] });
  const transactionHash = await walletClient.writeContract(request);
  const receipt = await verification.publicClient.waitForTransactionReceipt({ hash: transactionHash });
  if (receipt.status !== "success") throw new Error("Attestation transaction reverted");
  const existingAttestationId = await verification.publicClient.readContract({ address: verification.registry, abi: attestationServerAbi, functionName: "claimAttestations", args: [claimId] });
  return { ...verification, existingAttestationId, transactionHash };
}
