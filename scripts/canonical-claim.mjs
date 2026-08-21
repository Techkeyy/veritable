// One-off operator script: produce a genuine real-evidence canonical claim on the
// live Vercel deployment so /v1/reports/<claimId> resolves from durable storage.
//
// Flow: real network settlement-token payment -> hosted DeepSeek extraction (/v1/evidence/prepare)
// -> asset creation with the returned terms -> escrow + submitClaim -> hosted verifier
// (/v1/process) which persists the bundle and attests -> settle -> holders claim.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import dotenv from "dotenv";
import { hashCanonical } from "../packages/policy/dist/index.js";
import {
  createPublicClient, createWalletClient, http, keccak256, parseUnits,
  stringToHex, getAddress, zeroHash, formatUnits,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  assertCanonicalExtractionMatches,
  assertMainnetPreSpendState,
  assertSafeHostedBaseUrl,
  assertSelectedDeployment,
  attestationRequestMessage,
  evidencePreparationMessage,
  issuerFundingForNetwork,
  mainnetPayerReserve,
} from "./canonical-claim-safety.mjs";

const ROOT = process.cwd();
dotenv.config({ path: resolve(ROOT, ".env"), quiet: true });

// Network is selected by CHAIN_ENV; defaults to testnet so an accidental run
// can never touch Mainnet or spend real USDT.
const MAINNET = process.env.CHAIN_ENV === "bot-mainnet";
const NET = MAINNET
  ? {
    dir: "bot-mainnet", id: 677, label: "BOT Mainnet", chainName: "BOT Chain",
    rpc: process.env.BOT_MAINNET_RPC_URL || "https://rpc.botchain.ai",
    explorer: "https://scan.botchain.ai",
    symbol: "BOT", testnet: false,
  }
  : {
    dir: "bot-testnet", id: 968, label: "BOT Testnet", chainName: "BOT Chain Testnet",
    rpc: process.env.BOT_TESTNET_RPC_URL || "https://rpc.bohr.life",
    explorer: "https://scan.bohr.life",
    symbol: "tBOT", testnet: true,
  };

const SITE = process.env.HOSTED_TEST_BASE_URL || "https://veritable-web-sigma.vercel.app";
assertSafeHostedBaseUrl({ mainnet: MAINNET, site: SITE });
const RPC = NET.rpc;
const EXPLORER = NET.explorer;
const PERIOD = process.env.CANONICAL_PERIOD || "2026-08";
// On Mainnet the settlement token is official USDT and cannot be minted, so the
// amount must be small and the payer must already hold it.
const AMOUNT = parseUnits(process.env.CANONICAL_AMOUNT || (MAINNET ? "1" : "2000"), 6);
const AMOUNT_MINOR = AMOUNT.toString();
// The evidence document must state the same amount the terms register, or the
// AI_TERMS_MATCH rule fails and the claim is BLOCKED.
const AMOUNT_DECIMAL = Number(formatUnits(AMOUNT, 6)).toFixed(2);
// A 60/40 snapshot split must divide without dust.
if (AMOUNT % 5n !== 0n) {
  throw new Error(`CANONICAL_AMOUNT ${AMOUNT_DECIMAL} does not split 60/40 without rounding dust. Use a value whose minor units divide by 5.`);
}

const chain = {
  id: NET.id, name: NET.chainName,
  nativeCurrency: { name: NET.symbol, symbol: NET.symbol, decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
  blockExplorers: { default: { name: "BOTScan", url: EXPLORER } },
  testnet: NET.testnet,
};

const manifest = JSON.parse(await readFile(resolve(ROOT, `deployments/${NET.dir}/manifest.json`), "utf8"));
if (manifest.chainId !== NET.id) throw new Error(`Wrong-chain manifest for ${NET.dir}`);

const tokenAbi = [
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
];
const factoryAbi = [{
  type: "function", name: "createAsset", stateMutability: "nonpayable",
  inputs: [
    { name: "assetId", type: "bytes32" }, { name: "name", type: "string" }, { name: "symbol", type: "string" },
    { name: "policyHash", type: "bytes32" }, { name: "termsHash", type: "bytes32" },
    { name: "holders", type: "address[]" }, { name: "shares", type: "uint256[]" },
  ], outputs: [{ name: "shareToken", type: "address" }],
}];
const vaultAbi = [
  { type: "function", name: "submitClaim", stateMutability: "nonpayable", inputs: [{ name: "assetId", type: "bytes32" }, { name: "periodKey", type: "bytes32" }, { name: "amount", type: "uint256" }, { name: "evidenceRoot", type: "bytes32" }], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "periodClaims", stateMutability: "view", inputs: [{ name: "assetId", type: "bytes32" }, { name: "periodKey", type: "bytes32" }], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "claimYield", stateMutability: "nonpayable", inputs: [{ name: "claimId", type: "bytes32" }], outputs: [] },
  { type: "function", name: "getClaim", stateMutability: "view", inputs: [{ name: "claimId", type: "bytes32" }], outputs: [{ name: "claim", type: "tuple", components: [{ name: "assetId", type: "bytes32" }, { name: "periodKey", type: "bytes32" }, { name: "evidenceRoot", type: "bytes32" }, { name: "issuer", type: "address" }, { name: "shareToken", type: "address" }, { name: "escrowedAmount", type: "uint256" }, { name: "verifiedAmount", type: "uint256" }, { name: "snapshotId", type: "uint256" }, { name: "totalShares", type: "uint256" }, { name: "resolvedAt", type: "uint64" }, { name: "status", type: "uint8" }] }] },
];
const registryAbi = [
  { type: "function", name: "claimAttestations", stateMutability: "view", inputs: [{ name: "claimId", type: "bytes32" }], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "getAttestation", stateMutability: "view", inputs: [{ name: "attestationId", type: "bytes32" }], outputs: [{ name: "attestation", type: "tuple", components: [{ name: "data", type: "tuple", components: [{ name: "claimId", type: "bytes32" }, { name: "assetId", type: "bytes32" }, { name: "periodKey", type: "bytes32" }, { name: "claimedAmount", type: "uint256" }, { name: "verifiedAmount", type: "uint256" }, { name: "outcome", type: "uint8" }, { name: "evidenceRoot", type: "bytes32" }, { name: "reportHash", type: "bytes32" }, { name: "policyHash", type: "bytes32" }, { name: "termsHash", type: "bytes32" }, { name: "modelRunHash", type: "bytes32" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] }, { name: "verifier", type: "address" }, { name: "challenger", type: "address" }, { name: "counterEvidenceRoot", type: "bytes32" }, { name: "challengeDeadline", type: "uint64" }, { name: "status", type: "uint8" }] }] },
  { type: "function", name: "settle", stateMutability: "nonpayable", inputs: [{ name: "attestationId", type: "bytes32" }], outputs: [] },
];

const stakingAbi = [
  { type: "function", name: "stake", stateMutability: "payable", inputs: [], outputs: [] },
  { type: "function", name: "freeStake", stateMutability: "view", inputs: [{ name: "verifier", type: "address" }], outputs: [{ type: "uint256" }] },
];

const publicClient = createPublicClient({ chain, transport: http(RPC) });
const payer = privateKeyToAccount(
  MAINNET ? process.env.MAINNET_DEPLOYER_PRIVATE_KEY : process.env.DEPLOYER_PRIVATE_KEY,
);
const verifier = privateKeyToAccount(
  MAINNET ? process.env.MAINNET_VERIFIER_PRIVATE_KEY : process.env.VERIFIER_PRIVATE_KEY,
);
const issuerKey = generatePrivateKey();
const issuer = privateKeyToAccount(issuerKey);
const payerClient = createWalletClient({ chain, transport: http(RPC), account: payer });
const issuerClient = createWalletClient({ chain, transport: http(RPC), account: issuer });
const transactions = {};
const recoveryPath = resolve(ROOT, `.verifi/canonical-recovery-${NET.dir}-${issuer.address.toLowerCase()}.json`);
const issuerFunding = issuerFundingForNetwork(MAINNET);
const minimumMainnetPayerBot = mainnetPayerReserve();
let issuerRecovery = {
  schemaVersion: 1,
  network: NET.dir,
  chainId: NET.id,
  createdAt: new Date().toISOString(),
  stage: "ISSUER_GENERATED",
  issuer: issuer.address,
  issuerKey,
};
let recoveryPersisted = false;

async function persistIssuerRecoveryStage(stage, details = {}) {
  issuerRecovery = {
    ...issuerRecovery,
    ...details,
    stage,
    updatedAt: new Date().toISOString(),
  };
  await mkdir(resolve(ROOT, ".verifi"), { recursive: true });
  await writeFile(recoveryPath, `${JSON.stringify(issuerRecovery, null, 2)}\n`, "utf8");
  const persisted = JSON.parse(await readFile(recoveryPath, "utf8"));
  recoveryPersisted = persisted.network === NET.dir
    && persisted.chainId === NET.id
    && persisted.issuer?.toLowerCase() === issuer.address.toLowerCase()
    && persisted.issuerKey === issuerKey
    && persisted.stage === stage;
  if (!recoveryPersisted) throw new Error("Disposable issuer recovery state could not be verified after persistence");
}

async function persistIssuerRecovery() {
  await persistIssuerRecoveryStage("ISSUER_GENERATED");
}

async function runPreSpendChecks() {
  const actualChainId = await publicClient.getChainId();
  assertSelectedDeployment({
    mainnet: MAINNET,
    actualChainId,
    expectedChainId: NET.id,
    manifestChainId: manifest.chainId,
    manifestNetwork: manifest.network,
  });
  if (!MAINNET) return;

  const contractEntries = Object.entries(manifest.contracts).map(([name, rawAddress]) => [name, getAddress(rawAddress)]);
  const codeResults = await Promise.all(contractEntries.map(async ([name, address]) => ({
    name,
    code: await publicClient.getCode({ address }),
  })));
  const missingCode = codeResults.filter(({ code }) => !code || code === "0x").map(({ name }) => name);
  const [settlementTokenDecimals, freeStake, payerBotBalance, payerUsdtBalance, gasPrice] = await Promise.all([
    publicClient.readContract({ address: getAddress(manifest.contracts.settlementToken), abi: tokenAbi, functionName: "decimals" }),
    publicClient.readContract({ address: getAddress(manifest.contracts.verifierStaking), abi: stakingAbi, functionName: "freeStake", args: [verifier.address] }),
    publicClient.getBalance({ address: payer.address }),
    publicClient.readContract({ address: getAddress(manifest.contracts.settlementToken), abi: tokenAbi, functionName: "balanceOf", args: [payer.address] }),
    publicClient.getGasPrice(),
  ]);
  assertMainnetPreSpendState({
    mainnet: true,
    configuredSettlementToken: manifest.contracts.settlementToken,
    settlementTokenDecimals,
    missingCode,
    freeStake,
    requiredBond: BigInt(manifest.parameters.verifierBondWei),
    payerBotBalance,
    minimumPayerBotBalance: minimumMainnetPayerBot,
    gasPrice,
    payerUsdtBalance,
    requiredUsdt: AMOUNT,
    payerAddress: payer.address,
    manifestDeployer: manifest.deployer,
    verifierAddress: verifier.address,
    manifestVerifier: manifest.roles.verifier,
    recoveryPersisted,
  });
}

const log = (m) => process.stdout.write(`${m}\n`);
async function confirm(name, hash) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${name} reverted`);
  transactions[name] = { hash, explorerUrl: `${EXPLORER}/tx/${hash}` };
  log(`  ${name}: ${EXPLORER}/tx/${hash}`);
  return receipt;
}

await persistIssuerRecovery();
await runPreSpendChecks();

log(`Site:   ${SITE}`);
log(`Payer:  ${payer.address}`);
log(`Issuer: ${issuer.address} (fresh)\n`);

// 0. The bonded verifier must hold enough free stake to lock a new bond.
log("0. Checking verifier free stake");
const verifierClient = createWalletClient({ chain, transport: http(RPC), account: verifier });
const requiredBond = BigInt(manifest.parameters.verifierBondWei);
const freeStake = await publicClient.readContract({ address: manifest.contracts.verifierStaking, abi: stakingAbi, functionName: "freeStake", args: [verifier.address] });
log(`  free stake ${freeStake} wei, bond requires ${requiredBond} wei`);
if (freeStake < requiredBond) {
  if (MAINNET) throw new Error("Mainnet verifier free stake is insufficient; automatic Mainnet stake top-up is disabled");
  const topUp = requiredBond * 2n - freeStake;
  log(`  topping up ${topUp} wei`);
  await confirm("verifierStakeTopUp", await verifierClient.writeContract({ address: manifest.contracts.verifierStaking, abi: stakingAbi, functionName: "stake", value: topUp }));
}

// 1. Fund the fresh issuer with gas.
log("1. Funding fresh issuer wallet");
const issuerFundingReceipt = await confirm("fundIssuer", await payerClient.sendTransaction({ to: issuer.address, value: issuerFunding }));
await persistIssuerRecoveryStage("ISSUER_FUNDED", {
  issuerFundingWei: issuerFunding.toString(),
  fundIssuerTxHash: issuerFundingReceipt.transactionHash,
});

// 2. Real TestUSDT payment from payer to issuer. This is the income event.
log(`2. Real ${MAINNET ? "USDT" : "TestUSDT"} income payment (payer -> issuer)`);
if (MAINNET) {
  // Official USDT has no public mint. The payer must already hold the amount.
  const held = await publicClient.readContract({ address: manifest.contracts.settlementToken, abi: tokenAbi, functionName: "balanceOf", args: [payer.address] });
  if (held < AMOUNT) {
    throw new Error(`Payer holds ${held} USDT minor units, needs ${AMOUNT_MINOR}. Acquire real USDT on BOT Chain before running the Mainnet canonical claim.`);
  }
} else {
  await confirm("mintPayerFunds", await payerClient.writeContract({ address: manifest.contracts.settlementToken, abi: tokenAbi, functionName: "mint", args: [payer.address, AMOUNT] }));
}
const paymentReceipt = await confirm("incomePayment", await payerClient.writeContract({ address: manifest.contracts.settlementToken, abi: tokenAbi, functionName: "transfer", args: [issuer.address, AMOUNT] }));
const paymentTxHash = paymentReceipt.transactionHash;
const paymentBlock = await publicClient.getBlock({ blockNumber: paymentReceipt.blockNumber });
const paidAt = new Date(Number(paymentBlock.timestamp) * 1000).toISOString().slice(0, 10);
log(`  paidAt: ${paidAt}`);
await persistIssuerRecoveryStage("INCOME_PAYMENT_MADE", {
  paymentTxHash,
  paidAt,
  amountMinor: AMOUNT_MINOR,
});

// 3. Evidence document. Terms are stated explicitly so extraction is unambiguous.
const documentText = [
  "LEASE INCOME STATEMENT",
  "",
  "Property: Unit 4B, 118 Harbour Road",
  "Landlord reference: VERITABLE-DEMO-4B",
  `Billing period: ${PERIOD}`,
  "",
  `Amount due: ${AMOUNT_DECIMAL} USDT`,
  `Due date: ${paidAt}`,
  `Payment method: ${NET.chainName} USDT transfer`,
  "",
  "This statement records the monthly rental income for the billing period",
  `shown above. The amount due is ${AMOUNT_DECIMAL} USDT.`,
  `The payment due date is ${paidAt}.`,
].join("\n");
const documentBytes = new TextEncoder().encode(documentText);
const documentHash = keccak256(documentBytes);

const assetTerms = {
  expectedAmountMinor: AMOUNT_MINOR,
  dueDate: paidAt,
  windowDays: 5,
  amountToleranceMinor: "0",
  payerReferenceHash: keccak256(stringToHex(getAddress(payer.address).toLowerCase())),
};

// 4. Hosted evidence preparation: live DeepSeek extraction + private storage.
log("3. Hosted evidence preparation (live DeepSeek + Vercel Blob)");
const proofReference = `BOT_TRANSACTION:${paymentTxHash.toLowerCase()}`;
const prepMessage = evidencePreparationMessage({
  requester: issuer.address,
  periodKey: PERIOD,
  proofReference,
  documentHash,
  chainId: NET.id,
});
const prepSignature = await issuer.signMessage({ message: prepMessage });

const form = new FormData();
form.set("document", new File([documentBytes], "lease-income-statement.txt", { type: "text/plain" }));
form.set("requester", issuer.address);
form.set("signature", prepSignature);
form.set("periodKey", PERIOD);
form.set("assetTerms", JSON.stringify(assetTerms));
form.set("paymentProof", JSON.stringify({ kind: "BOT_TRANSACTION", txHash: paymentTxHash }));

const prepResponse = await fetch(`${SITE}/v1/evidence/prepare`, { method: "POST", body: form });
const prepResult = await prepResponse.json();
if (prepResponse.status !== 200) throw new Error(`prepare failed ${prepResponse.status}: ${JSON.stringify(prepResult)}`);
const bundle = prepResult.evidenceBundle;
assertCanonicalExtractionMatches({ bundle, assetTerms });
log(`  providerRunId: ${prepResult.providerRunId}`);
log(`  modelRunHash:  ${bundle.modelRunHash}`);
log(`  documents:     ${bundle.documents.map((d) => d.id).join(", ")}`);
const evidenceRoot = hashCanonical(bundle);
const termsHash = hashCanonical(bundle.assetTerms);
log(`  evidenceRoot:  ${evidenceRoot}`);
// Keep the exact validated bundle locally so a later on-chain failure stays resumable.
await persistIssuerRecoveryStage("EVIDENCE_PREPARED", {
  bundle,
  providerRunId: prepResult.providerRunId,
  paymentTxHash,
  evidenceRoot,
  termsHash,
});

// 5. Create the asset with the exact prepared terms.
log("4. Creating asset with the prepared terms");
const assetLabel = `asset:veritable-canonical-${issuer.address.slice(2, 10).toLowerCase()}`;
const assetId = keccak256(stringToHex(assetLabel));
const periodKeyHash = keccak256(stringToHex(PERIOD));
const policyHash = keccak256(stringToHex("policy-v1"));
const assetCreationReceipt = await confirm("createAsset", await issuerClient.writeContract({
  address: manifest.contracts.assetFactory, abi: factoryAbi, functionName: "createAsset",
  args: [assetId, "Veritable Canonical Income Asset", "vCANON", policyHash, termsHash,
    [issuer.address, payer.address], [parseUnits("60", 18), parseUnits("40", 18)]],
}));
await persistIssuerRecoveryStage("ASSET_CREATED", {
  assetId,
  assetCreationTxHash: assetCreationReceipt.transactionHash,
});

// 6. Escrow the received income and commit the evidence hash.
log("5. Escrowing income and submitting the claim");
await confirm("approveEscrow", await issuerClient.writeContract({ address: manifest.contracts.settlementToken, abi: tokenAbi, functionName: "approve", args: [manifest.contracts.yieldVault, AMOUNT] }));
const claimSubmissionReceipt = await confirm("submitClaim", await issuerClient.writeContract({ address: manifest.contracts.yieldVault, abi: vaultAbi, functionName: "submitClaim", args: [assetId, periodKeyHash, AMOUNT, evidenceRoot] }));
const claimId = await publicClient.readContract({ address: manifest.contracts.yieldVault, abi: vaultAbi, functionName: "periodClaims", args: [assetId, periodKeyHash] });
if (claimId === zeroHash) throw new Error("Claim was not created");
await persistIssuerRecoveryStage("CLAIM_SUBMITTED", {
  claimId,
  claimSubmissionTxHash: claimSubmissionReceipt.transactionHash,
});
log(`  claimId: ${claimId}`);

// 7. Hosted verifier: persists the bundle durably, then attests.
log("6. Hosted verifier attestation");
const attestMessage = attestationRequestMessage(claimId, NET.id, NET.label);
const attestSignature = await issuer.signMessage({ message: attestMessage });
const processResponse = await fetch(`${SITE}/v1/process/${claimId}`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ requester: issuer.address, signature: attestSignature, evidenceBundle: bundle }),
});
const processResult = await processResponse.json();
log(`  status:  ${processResponse.status} ${processResult.status || processResult.error || ""}`);
log(`  outcome: ${processResult.outcome}`);
if (processResult.report?.ruleResults) {
  for (const rule of processResult.report.ruleResults) log(`    ${rule.status.padEnd(7)} ${rule.id}`);
}
if (processResponse.status !== 200) throw new Error(`verifier failed: ${JSON.stringify(processResult)}`);
if (processResult.transactionHash) {
  transactions.hostedAttestation = { hash: processResult.transactionHash, explorerUrl: `${EXPLORER}/tx/${processResult.transactionHash}` };
  log(`  hostedAttestation: ${EXPLORER}/tx/${processResult.transactionHash}`);
}

// 8. Confirm the durable report now resolves on this deployment.
log("7. Verifying durable report resolution");
const reportResponse = await fetch(`${SITE}/v1/reports/${claimId}`, {
  method: "POST", headers: { "content-type": "application/json" }, body: "{}",
});
const reportResult = await reportResponse.json();
log(`  GET-from-storage status: ${reportResponse.status}`);
log(`  outcome: ${reportResult.report?.outcome}  rules: ${reportResult.report?.ruleResults?.length}`);
if (reportResponse.status !== 200) throw new Error("Durable report did not resolve; storage was not persisted");

// 9. Settle after the challenge window, then both holders claim.
log("8. Settling after the challenge window");
const attestationId = await publicClient.readContract({ address: manifest.contracts.attestationRegistry, abi: registryAbi, functionName: "claimAttestations", args: [claimId] });
const attestation = await publicClient.readContract({ address: manifest.contracts.attestationRegistry, abi: registryAbi, functionName: "getAttestation", args: [attestationId] });
while ((await publicClient.getBlock()).timestamp < attestation.challengeDeadline) {
  await new Promise((done) => setTimeout(done, 3000));
}
await confirm("settle", await issuerClient.writeContract({ address: manifest.contracts.attestationRegistry, abi: registryAbi, functionName: "settle", args: [attestationId] }));

log("9. Holder withdrawals");
const issuerBefore = await publicClient.readContract({ address: manifest.contracts.settlementToken, abi: tokenAbi, functionName: "balanceOf", args: [issuer.address] });
await confirm("claimHolder60", await issuerClient.writeContract({ address: manifest.contracts.yieldVault, abi: vaultAbi, functionName: "claimYield", args: [claimId] }));
const issuerAfter = await publicClient.readContract({ address: manifest.contracts.settlementToken, abi: tokenAbi, functionName: "balanceOf", args: [issuer.address] });
const payerBefore = await publicClient.readContract({ address: manifest.contracts.settlementToken, abi: tokenAbi, functionName: "balanceOf", args: [payer.address] });
await confirm("claimHolder40", await payerClient.writeContract({ address: manifest.contracts.yieldVault, abi: vaultAbi, functionName: "claimYield", args: [claimId] }));
const payerAfter = await publicClient.readContract({ address: manifest.contracts.settlementToken, abi: tokenAbi, functionName: "balanceOf", args: [payer.address] });
log(`  holder60 received: ${(issuerAfter - issuerBefore).toString()}`);
log(`  holder40 received: ${(payerAfter - payerBefore).toString()}`);

const claim = await publicClient.readContract({ address: manifest.contracts.yieldVault, abi: vaultAbi, functionName: "getClaim", args: [claimId] });
log(`  claim status: ${claim.status} (2 = RELEASED)`);

const artifact = {
  schemaVersion: 1,
  network: NET.dir,
  chainId: NET.id,
  site: SITE,
  evidenceRail: "LIVE_DEEPSEEK_EXTRACTION_PLUS_ONCHAIN_PAYMENT_PROOF",
  period: PERIOD,
  assetLabel,
  assetId,
  claimId,
  attestationId,
  evidenceRoot,
  termsHash,
  modelRunHash: bundle.modelRunHash,
  providerRunId: prepResult.providerRunId,
  paymentProof: { kind: "BOT_CHAIN_TX", txHash: paymentTxHash, payer: payer.address, paidAt },
  issuer: issuer.address,
  amountMinor: AMOUNT_MINOR,
  outcome: reportResult.report?.outcome,
  ruleResults: reportResult.report?.ruleResults?.map((r) => ({ id: r.id, status: r.status })),
  distribution: { holder60: (issuerAfter - issuerBefore).toString(), holder40: (payerAfter - payerBefore).toString() },
  reportEndpoint: `${SITE}/v1/reports/${claimId}`,
  secretsIncluded: false,
  transactions,
};
await writeFile(resolve(ROOT, `deployments/${NET.dir}/canonical-claim.json`), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
log(`\nWrote deployments/${NET.dir}/canonical-claim.json`);
log(`Report: ${SITE}/v1/reports/${claimId}`);
