import { runtimeChainConfig, environmentSchema } from "@veritable/config";
import { resolve } from "node:path";
import dotenv from "dotenv";
import { verificationInputSchema, signedPaymentEnvelopeSchema } from "@veritable/schemas";
import {
  createPublicClient,
  getAddress,
  http,
  type Address,
  type Hex,
  zeroHash,
} from "viem";
import { ClaimProcessor } from "./processor.js";
import { attestationRegistryAbi, createChainSubmitter, yieldClaimEventAbi } from "./chain.js";
import { FileJobStore, type ClaimEvent } from "./store.js";

dotenv.config({ path: resolve(process.cwd(), "../../.env"), quiet: true });
const configuredEnvironment = environmentSchema.parse(process.env.CHAIN_ENV ?? "bot-testnet");
dotenv.config({
  path: resolve(process.cwd(), `../../deployments/${configuredEnvironment}/agent.env`),
  quiet: true,
  // This generated file contains only public, deployment-specific values and
  // must replace blank/stale placeholders from the root secret environment.
  override: true,
});

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const environment = environmentSchema.parse(process.env.CHAIN_ENV ?? configuredEnvironment);
if (environment === "bot-mainnet" && process.env.ALLOW_MAINNET !== "true") {
  throw new Error("Mainnet agent startup is locked until ALLOW_MAINNET=true after the Testnet gate");
}
const chainConfig = runtimeChainConfig(environment);
const vaultAddress = getAddress(required("YIELD_VAULT_ADDRESS"));
const registryAddress = getAddress(required("ATTESTATION_REGISTRY_ADDRESS"));
const verifierPrivateKey = required(environment === "bot-mainnet" ? "MAINNET_VERIFIER_PRIVATE_KEY" : "VERIFIER_PRIVATE_KEY") as Hex;
const trustedPaymentSigner = getAddress(required(environment === "bot-mainnet" ? "MAINNET_EVIDENCE_SIGNER_ADDRESS" : "EVIDENCE_SIGNER_ADDRESS"));
const apiBaseUrl = process.env.EVIDENCE_API_URL ?? "http://127.0.0.1:4100";
const store = await FileJobStore.open(process.env.AGENT_STATE_PATH || "../../.verifi/agent-jobs.json");
const client = createPublicClient({ chain: chainConfig.chain, transport: http(chainConfig.httpRpcUrl) });
const submitAttestation = createChainSubmitter({
  chain: chainConfig.chain,
  rpcUrl: chainConfig.httpRpcUrl,
  registryAddress,
  verifierPrivateKey,
});

const bundleCache = new Map<string, Promise<{ evidence: unknown; paymentReference: string }>>();
function bundle(event: ClaimEvent) {
  const key = `${event.claimId}:${event.evidenceRoot}`;
  const existing = bundleCache.get(key);
  if (existing) return existing;
  const url = new URL(`/v1/evidence/${event.evidenceRoot}`, apiBaseUrl);
  url.searchParams.set("claimId", event.claimId);
  url.searchParams.set("assetId", event.assetId);
  url.searchParams.set("amountMinor", event.amountMinor);
  const request = fetch(url).then(async (response) => {
    if (!response.ok) throw new Error(`Evidence API returned ${response.status}`);
    return response.json() as Promise<{ evidence: unknown; paymentReference: string }>;
  });
  bundleCache.set(key, request);
  return request;
}

const processor = new ClaimProcessor({
  store,
  trustedPaymentSigner,
  fetchEvidence: async (event) => verificationInputSchema.omit({ paymentRecords: true }).parse((await bundle(event)).evidence),
  fetchPayment: async (event) => {
    const reference = (await bundle(event)).paymentReference;
    const response = await fetch(new URL(`/v1/payments/${encodeURIComponent(reference)}`, apiBaseUrl));
    if (!response.ok) throw new Error(`Payment API returned ${response.status}`);
    return signedPaymentEnvelopeSchema.parse(await response.json());
  },
  findExistingAttestation: async (event) => {
    const attestationId = await client.readContract({
      address: registryAddress,
      abi: attestationRegistryAbi,
      functionName: "claimAttestations",
      args: [event.claimId as Hex],
    });
    return attestationId === zeroHash ? undefined : attestationId;
  },
  submitAttestation,
});

function toClaimEvent(log: {
  transactionHash: Hex | null;
  logIndex: number | null;
  blockNumber: bigint | null;
  args: Record<string, unknown>;
}): ClaimEvent {
  if (!log.transactionHash || log.logIndex === null || log.blockNumber === null) {
    throw new Error("Yield claim log is missing chain identity fields");
  }
  return {
    chainId: chainConfig.chain.id,
    transactionHash: log.transactionHash,
    logIndex: log.logIndex,
    blockNumber: log.blockNumber.toString(),
    claimId: log.args.claimId as string,
    assetId: log.args.assetId as string,
    periodKey: log.args.periodKey as string,
    issuer: log.args.issuer as string,
    amountMinor: String(log.args.amount),
    evidenceRoot: log.args.evidenceRoot as string,
  };
}

const deploymentBlock = BigInt(required("YIELD_VAULT_DEPLOYMENT_BLOCK"));
let recoveryQueue = Promise.resolve();

async function recoverThrough(toBlock: bigint) {
  const lastProcessed = await store.getLastProcessedBlock(chainConfig.chain.id);
  const fromBlock = lastProcessed === undefined ? deploymentBlock : lastProcessed + 1n;
  if (fromBlock > toBlock) return;
  const historical = await client.getContractEvents({
    address: vaultAddress as Address,
    abi: yieldClaimEventAbi,
    eventName: "YieldClaimSubmitted",
    fromBlock,
    toBlock,
    strict: true,
  });
  const events = historical.map((log) => toClaimEvent(log as Parameters<typeof toClaimEvent>[0]));
  const byBlock = new Map<bigint, ClaimEvent[]>();
  for (const event of events) {
    const block = BigInt(event.blockNumber);
    const group = byBlock.get(block) ?? [];
    group.push(event);
    byBlock.set(block, group);
  }
  for (const block of [...byBlock.keys()].sort((left, right) => left < right ? -1 : left > right ? 1 : 0)) {
    const blockEvents = (byBlock.get(block) ?? []).sort((left, right) => left.logIndex - right.logIndex);
    for (const event of blockEvents) {
      try {
        const job = await processor.process(event);
        process.stdout.write(`Processed claim ${event.claimId}: ${job.status}\n`);
      } catch (error) {
        process.stderr.write(`Claim ${event.claimId} failed: ${error instanceof Error ? error.message : "Unknown error"}\n`);
        return;
      }
    }
    await store.setLastProcessedBlock(chainConfig.chain.id, block);
  }
  await store.setLastProcessedBlock(chainConfig.chain.id, toBlock);
}

function enqueueRecovery() {
  recoveryQueue = recoveryQueue
    .then(async () => recoverThrough(await client.getBlockNumber()))
    .catch((error) => {
      process.stderr.write(`Recovery failed: ${error instanceof Error ? error.message : "Unknown error"}\n`);
    });
}

await recoverThrough(await client.getBlockNumber());

// BOT's public RPC evicts eth_newFilter state aggressively. The same ordered
// recovery path is used for both live discovery and retries via stateless logs.
setInterval(enqueueRecovery, Number(process.env.AGENT_RETRY_INTERVAL_MS ?? "5000"));
process.stdout.write(`Veritable agent watching ${vaultAddress} on chain ${chainConfig.chain.id}\n`);
