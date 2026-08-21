import {
  BaseError,
  ContractFunctionRevertedError,
  decodeErrorResult,
  formatUnits,
  isHex,
  type Hex,
  type PublicClient,
} from "viem";

// Every custom error the protocol can revert with. Kept here rather than in the
// call-site ABIs so a single list covers both simulation failures and mined
// failures, and so adding a contract error only means adding one entry.
export const protocolErrorsAbi = [
  // Shared
  { type: "error", name: "ZeroAddress", inputs: [] },
  { type: "error", name: "ZeroAmount", inputs: [] },
  { type: "error", name: "InvalidAmount", inputs: [] },
  { type: "error", name: "NativeTransferFailed", inputs: [] },
  // AssetRegistry
  { type: "error", name: "AssetAlreadyExists", inputs: [{ name: "assetId", type: "bytes32" }] },
  { type: "error", name: "AssetNotFound", inputs: [{ name: "assetId", type: "bytes32" }] },
  // AssetFactory
  { type: "error", name: "InvalidAllocationCount", inputs: [] },
  { type: "error", name: "InvalidAllocation", inputs: [{ name: "index", type: "uint256" }] },
  // YieldVault
  { type: "error", name: "AssetInactive", inputs: [{ name: "assetId", type: "bytes32" }] },
  { type: "error", name: "NotAssetIssuer", inputs: [{ name: "caller", type: "address" }] },
  { type: "error", name: "PeriodAlreadyClaimed", inputs: [{ name: "assetId", type: "bytes32" }, { name: "periodKey", type: "bytes32" }] },
  { type: "error", name: "ClaimNotSubmitted", inputs: [{ name: "claimId", type: "bytes32" }] },
  { type: "error", name: "ClaimNotReleased", inputs: [{ name: "claimId", type: "bytes32" }] },
  { type: "error", name: "ClaimNotBlocked", inputs: [{ name: "claimId", type: "bytes32" }] },
  { type: "error", name: "AlreadyClaimed", inputs: [{ name: "claimId", type: "bytes32" }, { name: "holder", type: "address" }] },
  { type: "error", name: "NoEntitlement", inputs: [{ name: "claimId", type: "bytes32" }, { name: "holder", type: "address" }] },
  { type: "error", name: "VerifiedAmountMismatch", inputs: [{ name: "verifiedAmount", type: "uint256" }, { name: "escrowedAmount", type: "uint256" }] },
  { type: "error", name: "NoShareSupply", inputs: [] },
  { type: "error", name: "RefundNotReady", inputs: [{ name: "availableAt", type: "uint256" }] },
  // AttestationRegistry
  { type: "error", name: "InvalidOutcome", inputs: [] },
  { type: "error", name: "InvalidVerifiedAmount", inputs: [] },
  { type: "error", name: "SignatureExpired", inputs: [{ name: "deadline", type: "uint256" }] },
  { type: "error", name: "InvalidNonce", inputs: [{ name: "provided", type: "uint256" }, { name: "expected", type: "uint256" }] },
  { type: "error", name: "ClaimMismatch", inputs: [] },
  { type: "error", name: "PolicyMismatch", inputs: [{ name: "registeredPolicyHash", type: "bytes32" }, { name: "attestedPolicyHash", type: "bytes32" }] },
  { type: "error", name: "TermsMismatch", inputs: [{ name: "registeredTermsHash", type: "bytes32" }, { name: "attestedTermsHash", type: "bytes32" }] },
  { type: "error", name: "ClaimAlreadyAttested", inputs: [{ name: "claimId", type: "bytes32" }] },
  { type: "error", name: "InvalidVerifier", inputs: [{ name: "verifier", type: "address" }] },
  { type: "error", name: "InvalidChallengeBond", inputs: [{ name: "provided", type: "uint256" }, { name: "required", type: "uint256" }] },
  { type: "error", name: "AttestationNotPending", inputs: [{ name: "attestationId", type: "bytes32" }] },
  { type: "error", name: "ChallengeWindowClosed", inputs: [{ name: "deadline", type: "uint64" }] },
  { type: "error", name: "ChallengeWindowOpen", inputs: [{ name: "deadline", type: "uint64" }] },
  { type: "error", name: "AttestationNotChallenged", inputs: [{ name: "attestationId", type: "bytes32" }] },
  // VerifierStaking
  { type: "error", name: "InsufficientFreeStake", inputs: [{ name: "available", type: "uint256" }, { name: "required", type: "uint256" }] },
  { type: "error", name: "LockAlreadyExists", inputs: [{ name: "attestationId", type: "bytes32" }] },
  { type: "error", name: "LockNotActive", inputs: [{ name: "attestationId", type: "bytes32" }] },
  { type: "error", name: "UnstakeNotReady", inputs: [{ name: "availableAt", type: "uint64" }] },
  // PrimaryOfferingMarketplace
  { type: "error", name: "InvalidListing", inputs: [] },
  { type: "error", name: "NotListingIssuer", inputs: [] },
  { type: "error", name: "ListingInactive", inputs: [] },
  { type: "error", name: "InsufficientInventory", inputs: [] },
  { type: "error", name: "CostExceedsMaximum", inputs: [{ name: "cost", type: "uint256" }, { name: "maximum", type: "uint256" }] },
  { type: "error", name: "UnsupportedShareDecimals", inputs: [{ name: "decimals", type: "uint8" }] },
] as const;

const bot = (wei: unknown) => `${formatUnits(BigInt(String(wei)), 18)} BOT`;
const usdt = (minor: unknown) => `${formatUnits(BigInt(String(minor)), 6)} USDT`;
const at = (seconds: unknown) => new Date(Number(seconds) * 1000).toLocaleString();

// Each message says what happened and what to do about it. A decoded error the
// reader cannot act on is barely better than "reverted".
function message(name: string, args: readonly unknown[]): string {
  switch (name) {
    case "PeriodAlreadyClaimed":
      return "This property already has a claim for that period. Every asset accepts one income claim per period. Use a different period, or a new property.";
    case "NotAssetIssuer":
      return "Only the wallet that created this property can report its income. Switch to the issuing wallet.";
    case "AssetInactive":
      return "This property is no longer active, so it cannot accept new claims.";
    case "AssetNotFound":
      return "That property has not been registered yet. Create the asset before reporting income.";
    case "AssetAlreadyExists":
      return "A property with that name already exists. Property names must be unique, so pick another.";
    case "NoShareSupply":
      return "This property has no shares issued, so there is nobody to distribute income to.";
    case "InvalidAmount":
      return "The amount must be greater than zero.";
    case "ClaimNotSubmitted":
      return "No claim exists for that ID yet.";
    case "ClaimNotReleased":
      return "This claim has not been released. Yield can only be withdrawn after a verified attestation settles.";
    case "ClaimNotBlocked":
      return "This claim was not blocked, so there is nothing to refund.";
    case "AlreadyClaimed":
      return "This wallet has already withdrawn its share of that claim.";
    case "NoEntitlement":
      return "This wallet held no shares at the claim's snapshot, so it has nothing to withdraw.";
    case "VerifiedAmountMismatch":
      return `The verified amount (${usdt(args[0])}) does not match the escrowed amount (${usdt(args[1])}). Partial releases are rejected so escrow cannot be stranded.`;
    case "RefundNotReady":
      return `The blocked escrow cannot be refunded until ${at(args[0])}.`;
    case "ClaimAlreadyAttested":
      return "This claim already has an attestation. Each claim is attested once.";
    case "PolicyMismatch":
      return "The attestation uses a different policy than the one this property registered.";
    case "TermsMismatch":
      return "The evidence terms do not match the terms registered for this property.";
    case "ClaimMismatch":
      return "The attestation does not correspond to this claim.";
    case "InvalidVerifier":
      return "That address is not an authorized verifier.";
    case "InvalidNonce":
      return `Verifier nonce ${String(args[0])} was supplied but ${String(args[1])} was expected. Retry the attestation.`;
    case "SignatureExpired":
      return `The attestation signature expired at ${at(args[0])}. Request a fresh one.`;
    case "InsufficientFreeStake":
      return `The verifier has ${bot(args[0])} of free stake but needs ${bot(args[1])} to bond this attestation. Stake more before attesting.`;
    case "InvalidChallengeBond":
      return `The challenge bond sent was ${bot(args[0])} but ${bot(args[1])} is required.`;
    case "AttestationNotPending":
      return "This attestation is not pending, so it cannot be challenged or settled.";
    case "ChallengeWindowClosed":
      return `The challenge window closed at ${at(args[0])}.`;
    case "ChallengeWindowOpen":
      return `The challenge window is open until ${at(args[0])}. Settlement is only possible after it closes.`;
    case "AttestationNotChallenged":
      return "This attestation has not been challenged, so there is nothing to resolve.";
    case "UnstakeNotReady":
      return `Staked funds are locked until ${at(args[0])}.`;
    case "LockAlreadyExists":
      return "A stake lock already exists for that attestation.";
    case "LockNotActive":
      return "No active stake lock exists for that attestation.";
    case "ListingInactive":
      return "This offering is closed.";
    case "InsufficientInventory":
      return "The offering does not have that many shares left.";
    case "CostExceedsMaximum":
      return `The purchase would cost ${usdt(args[0])}, above the ${usdt(args[1])} maximum you set.`;
    case "NotListingIssuer":
      return "Only the wallet that created this listing can change it.";
    case "InvalidListing":
      return "That listing does not exist.";
    case "UnsupportedShareDecimals":
      return "This share token uses an unsupported number of decimals.";
    case "InvalidAllocationCount":
    case "InvalidAllocation":
      return "The holder and share allocations are invalid. Each holder needs a non zero share.";
    case "InvalidOutcome":
      return "The attestation outcome is not valid.";
    case "InvalidVerifiedAmount":
      return "The verified amount is not valid for this outcome.";
    case "ZeroAmount":
      return "The amount must be greater than zero.";
    case "NativeTransferFailed":
      return "A native BOT transfer failed.";
    default:
      return `The contract rejected this with ${name}.`;
  }
}

function fromRevertData(data: Hex): string | undefined {
  try {
    const decoded = decodeErrorResult({ abi: protocolErrorsAbi, data });
    return message(decoded.errorName, (decoded.args ?? []) as readonly unknown[]);
  } catch {
    return undefined;
  }
}

/** Decode a thrown viem error from a simulation or write into readable text. */
export function describeContractError(error: unknown): string | undefined {
  if (!(error instanceof BaseError)) return undefined;
  const reverted = error.walk((candidate) => candidate instanceof ContractFunctionRevertedError);
  if (reverted instanceof ContractFunctionRevertedError) {
    if (reverted.data?.errorName) {
      return message(reverted.data.errorName, (reverted.data.args ?? []) as readonly unknown[]);
    }
    const raw = (reverted as { raw?: unknown }).raw;
    if (isHex(raw)) return fromRevertData(raw);
  }
  const details = (error as { details?: unknown }).details;
  if (typeof details === "string") {
    const match = details.match(/0x[0-9a-fA-F]{8,}/);
    if (match && isHex(match[0])) return fromRevertData(match[0] as Hex);
  }
  return undefined;
}

/**
 * Explain a transaction that mined with a failed status. The receipt carries no
 * reason, so the call is replayed at the block it failed in to recover the
 * revert data. Returns undefined when the reason cannot be recovered.
 */
export async function explainFailedTransaction(
  client: PublicClient,
  hash: Hex,
): Promise<string | undefined> {
  try {
    const transaction = await client.getTransaction({ hash });
    await client.call({
      account: transaction.from,
      to: transaction.to ?? undefined,
      data: transaction.input,
      value: transaction.value,
      blockNumber: transaction.blockNumber ?? undefined,
    });
    return undefined;
  } catch (error) {
    return describeContractError(error);
  }
}
