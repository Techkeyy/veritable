import { hashCanonical } from "@veritable/policy";
import { assetTermsSchema, signedPaymentEnvelopeSchema, type AssetTerms, type SignedPaymentEnvelope } from "@veritable/schemas";
import {
  createPublicClient,
  decodeEventLog,
  getAddress,
  http,
  isAddress,
  isHex,
  keccak256,
  stringToHex,
  verifyMessage,
  type Address,
  type Hex,
} from "viem";
import { activeChain, contracts } from "./chain";
import { loadPaymentRequest, type PaymentRequestRecord } from "./evidenceStorage";

const transferAbi = [{
  type: "event",
  name: "Transfer",
  inputs: [
    { indexed: true, name: "from", type: "address" },
    { indexed: true, name: "to", type: "address" },
    { indexed: false, name: "value", type: "uint256" },
  ],
}] as const;

export type PaymentProofInput =
  | { kind: "BOT_TRANSACTION"; txHash: Hex }
  | { kind: "COUNTERPARTY_SIGNATURE"; requestId: string };

export function payerReferenceHash(payer: Address): Hex {
  return keccak256(stringToHex(getAddress(payer).toLowerCase()));
}

export function counterpartySource(input: {
  requestId: string;
  issuer: Address;
  periodKey: string;
  documentHash: Hex;
  chainId: number;
}) {
  return [
    "COUNTERPARTY_ATTESTATION",
    input.requestId,
    input.issuer.toLowerCase(),
    input.periodKey,
    input.documentHash.toLowerCase(),
    String(input.chainId),
  ].join(":");
}

export function parsePaymentProof(raw: unknown): PaymentProofInput {
  if (!raw || typeof raw !== "object") throw new Error("Choose a payment-proof method");
  const value = raw as Record<string, unknown>;
  if (value.kind === "BOT_TRANSACTION" && typeof value.txHash === "string" && isHex(value.txHash) && value.txHash.length === 66) {
    return { kind: "BOT_TRANSACTION", txHash: value.txHash as Hex };
  }
  if (value.kind === "COUNTERPARTY_SIGNATURE" && typeof value.requestId === "string" && /^[0-9a-f-]{20,64}$/i.test(value.requestId)) {
    return { kind: "COUNTERPARTY_SIGNATURE", requestId: value.requestId };
  }
  throw new Error("The payment proof is incomplete");
}

function publicClient() {
  const rpcUrl = activeChain.id === 677
    ? process.env.BOT_MAINNET_RPC_URL || process.env.NEXT_PUBLIC_BOT_MAINNET_RPC_URL || "https://rpc.botchain.ai"
    : process.env.BOT_TESTNET_RPC_URL || process.env.NEXT_PUBLIC_BOT_TESTNET_RPC_URL || "https://rpc.bohr.life";
  return createPublicClient({ chain: activeChain, transport: http(rpcUrl) });
}

function internalEnvelope(input: {
  signer: Address;
  amountMinor: string;
  paidAt: string;
  payerReferenceHash: Hex;
  source: string;
  issuedAt: string;
  expiresAt: string;
}): SignedPaymentEnvelope {
  const unsigned = {
    status: "FOUND" as const,
    amountMinor: input.amountMinor,
    paidAt: input.paidAt,
    payerReferenceHash: input.payerReferenceHash,
    source: input.source,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
  };
  return signedPaymentEnvelopeSchema.parse({
    record: { ...unsigned, payloadHash: hashCanonical(unsigned) },
    signer: input.signer,
    signature: "0x00",
  });
}

export async function envelopeFromBotTransaction(input: {
  txHash: Hex;
  recipient: Address;
  expectedAmountMinor: string;
}): Promise<SignedPaymentEnvelope> {
  const settlement = contracts.settlement;
  if (!settlement) throw new Error("Settlement token is not configured");
  const client = publicClient();
  const [transaction, receipt] = await Promise.all([
    client.getTransaction({ hash: input.txHash }),
    client.getTransactionReceipt({ hash: input.txHash }),
  ]);
  if (receipt.status !== "success") throw new Error("The BOT payment transaction reverted");
  let matched = false;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== settlement.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({ abi: transferAbi, data: log.data, topics: log.topics });
      if (
        decoded.eventName === "Transfer"
        && decoded.args.from.toLowerCase() === transaction.from.toLowerCase()
        && decoded.args.to.toLowerCase() === input.recipient.toLowerCase()
        && decoded.args.value.toString() === input.expectedAmountMinor
      ) {
        matched = true;
        break;
      }
    } catch {
      // Ignore unrelated logs from the settlement-token transaction.
    }
  }
  if (!matched) throw new Error("No matching Testnet USDT transfer to the connected issuer was found in that transaction");
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  const paidAtDate = new Date(Number(block.timestamp) * 1000);
  const issuedAt = paidAtDate.toISOString();
  const expiresAt = new Date(paidAtDate.getTime() + 100 * 365 * 86_400_000).toISOString();
  return internalEnvelope({
    signer: transaction.from,
    amountMinor: input.expectedAmountMinor,
    paidAt: issuedAt.slice(0, 10),
    payerReferenceHash: payerReferenceHash(transaction.from),
    source: `BOT_CHAIN_TX:${input.txHash.toLowerCase()}`,
    issuedAt,
    expiresAt,
  });
}

export async function completedCounterpartyEnvelope(input: {
  requestId: string;
  issuer: Address;
  expectedAmountMinor: string;
  periodKey: string;
  documentHash: Hex;
}): Promise<SignedPaymentEnvelope> {
  const request = await loadPaymentRequest(input.requestId);
  if (!request) throw new Error("The payer-confirmation request was not found");
  if (request.issuer.toLowerCase() !== input.issuer.toLowerCase()) throw new Error("This payer request belongs to another issuer");
  if (request.record.amountMinor !== input.expectedAmountMinor) throw new Error("The payer-confirmed amount does not match the asset terms");
  if (request.periodKey !== input.periodKey) throw new Error("The payer-confirmed period does not match this evidence");
  if (request.documentHash.toLowerCase() !== input.documentHash.toLowerCase()) throw new Error("The payer confirmation was created for a different document");
  if (!request.envelope) throw new Error("The payer has not signed the confirmation yet");
  return signedPaymentEnvelopeSchema.parse(request.envelope);
}

export async function resolvePaymentProof(input: {
  rawProof: unknown;
  requester: Address;
  rawAssetTerms: unknown;
  periodKey: string;
  documentHash: Hex;
}): Promise<{ assetTerms: AssetTerms; envelope: SignedPaymentEnvelope; proofReference: string }> {
  const proof = parsePaymentProof(input.rawProof);
  const rawTerms = assetTermsSchema.parse(input.rawAssetTerms);
  const envelope = proof.kind === "BOT_TRANSACTION"
    ? await envelopeFromBotTransaction({
        txHash: proof.txHash,
        recipient: input.requester,
        expectedAmountMinor: rawTerms.expectedAmountMinor,
      })
    : await completedCounterpartyEnvelope({
        requestId: proof.requestId,
        issuer: input.requester,
        expectedAmountMinor: rawTerms.expectedAmountMinor,
        periodKey: input.periodKey,
        documentHash: input.documentHash,
      });
  return {
    assetTerms: { ...rawTerms, payerReferenceHash: envelope.record.payerReferenceHash! },
    envelope,
    proofReference: proof.kind === "BOT_TRANSACTION"
      ? `BOT_TRANSACTION:${proof.txHash.toLowerCase()}`
      : `COUNTERPARTY_SIGNATURE:${proof.requestId}`,
  };
}

export function paymentRequestPublicView(request: PaymentRequestRecord) {
  return {
    requestId: request.requestId,
    issuer: request.issuer,
    payer: request.payer,
    periodKey: request.periodKey,
    documentHash: request.documentHash,
    record: request.record,
    status: request.envelope ? "CONFIRMED" : "PENDING",
  };
}

export async function verifyPayerConfirmation(input: {
  request: PaymentRequestRecord;
  payer: string;
  signature: string;
}) {
  if (!isAddress(input.payer) || !isHex(input.signature)) return false;
  if (input.payer.toLowerCase() !== input.request.payer.toLowerCase()) return false;
  return verifyMessage({
    address: input.request.payer,
    message: { raw: input.request.record.payloadHash as Hex },
    signature: input.signature as Hex,
  });
}
