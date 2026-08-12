import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { hashCanonical } from "@veritable/policy";
import dotenv from "dotenv";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  parseEther,
  parseUnits,
  stringToHex,
  zeroHash,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

dotenv.config({ path: resolve(process.cwd(), "../../.env"), quiet: true });

const chain = {
  id: 968,
  name: "BOT Chain Testnet",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.bohr.life"] } },
  blockExplorers: { default: { name: "BOTScan Testnet", url: "https://scan.bohr.life" } },
  testnet: true,
};
const RPC = process.env.BOT_TESTNET_RPC_URL || "https://rpc.bohr.life";
const SITE = process.env.HOSTED_TEST_BASE_URL || "https://verifi-bot-chain.cheery-bowl-9509.chatgpt.site";
const EXPLORER = "https://scan.bohr.life";
const PERIOD = "2026-08";
const AMOUNT = parseUnits("2000", 6);
const ZERO = `0x${"00".repeat(32)}`;

const factoryAbi = [{
  type: "function", name: "createAsset", stateMutability: "nonpayable",
  inputs: [
    { name: "assetId", type: "bytes32" }, { name: "name", type: "string" },
    { name: "symbol", type: "string" }, { name: "policyHash", type: "bytes32" },
    { name: "termsHash", type: "bytes32" }, { name: "holders", type: "address[]" },
    { name: "shares", type: "uint256[]" },
  ], outputs: [{ name: "shareToken", type: "address" }],
}];
const tokenAbi = [
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
];
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

const manifest = JSON.parse(await readFile(resolve(process.cwd(), "../../deployments/bot-testnet/manifest.json"), "utf8"));
if (manifest.chainId !== chain.id) throw new Error("Wrong-chain manifest");
const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
if (!deployerKey) throw new Error("Dedicated Testnet deployer key is required");
const funder = privateKeyToAccount(deployerKey);
const fresh = privateKeyToAccount(generatePrivateKey());
const publicClient = createPublicClient({ chain, transport: http(RPC) });
const funderClient = createWalletClient({ chain, transport: http(RPC), account: funder });
const freshClient = createWalletClient({ chain, transport: http(RPC), account: fresh });
const transactions = {};

async function confirm(name, hash) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${name} reverted`);
  transactions[name] = { hash, explorerUrl: `${EXPLORER}/tx/${hash}` };
  process.stdout.write(`${name}: ${EXPLORER}/tx/${hash}\n`);
  return receipt;
}

await confirm("fundFreshWallet", await funderClient.sendTransaction({ to: fresh.address, value: parseEther("0.08") }));
const suffix = fresh.address.slice(2, 10).toLowerCase();
const assetLabel = `asset:issuer-${suffix}`;
const assetId = keccak256(stringToHex(assetLabel));
const periodKey = keccak256(stringToHex(PERIOD));
const policyHash = keccak256(stringToHex("policy-v1"));
const terms = { expectedAmountMinor: "2000000000", dueDate: "2026-08-01", windowDays: 5, amountToleranceMinor: "0", payerReferenceHash: `0x${"33".repeat(32)}` };
const termsHash = hashCanonical(terms);
await confirm("createAsset", await freshClient.writeContract({ address: manifest.contracts.assetFactory, abi: factoryAbi, functionName: "createAsset", args: [assetId, "Veritable Fresh Wallet Asset", "vFRESH", policyHash, termsHash, [fresh.address, fresh.address], [parseUnits("60", 18), parseUnits("40", 18)]] }));
await confirm("mintSandboxUSDT", await freshClient.writeContract({ address: manifest.contracts.settlementToken, abi: tokenAbi, functionName: "mint", args: [fresh.address, AMOUNT] }));
await confirm("approveEscrow", await freshClient.writeContract({ address: manifest.contracts.settlementToken, abi: tokenAbi, functionName: "approve", args: [manifest.contracts.yieldVault, AMOUNT] }));
await confirm("submitClaim", await freshClient.writeContract({ address: manifest.contracts.yieldVault, abi: vaultAbi, functionName: "submitClaim", args: [assetId, periodKey, AMOUNT, keccak256(stringToHex("evidence:exact-payment"))] }));
const claimId = await publicClient.readContract({ address: manifest.contracts.yieldVault, abi: vaultAbi, functionName: "periodClaims", args: [assetId, periodKey] });
if (claimId === zeroHash) throw new Error("Fresh wallet claim was not created");
const message = ["Veritable BOT Testnet attestation request", `Claim: ${claimId}`, "Chain: 968", "Purpose: authorize the bonded verifier to inspect this claim's committed sandbox evidence."].join("\n");
const signature = await fresh.signMessage({ message });
const processResponse = await fetch(`${SITE}/v1/process/${claimId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requester: fresh.address, signature }) });
const processResult = await processResponse.json();
if (processResponse.status !== 200 || processResult.status !== "SUBMITTED") throw new Error(`Hosted verifier failed: ${processResponse.status}/${JSON.stringify(processResult)}`);
transactions.hostedAttestation = { hash: processResult.transactionHash, explorerUrl: `${EXPLORER}/tx/${processResult.transactionHash}` };
process.stdout.write(`hostedAttestation: ${EXPLORER}/tx/${processResult.transactionHash}\n`);
const attestationId = await publicClient.readContract({ address: manifest.contracts.attestationRegistry, abi: registryAbi, functionName: "claimAttestations", args: [claimId] });
if (attestationId === ZERO) throw new Error("Hosted verifier did not create an attestation");
let attestation = await publicClient.readContract({ address: manifest.contracts.attestationRegistry, abi: registryAbi, functionName: "getAttestation", args: [attestationId] });
while ((await publicClient.getBlock()).timestamp < attestation.challengeDeadline) await new Promise((done) => setTimeout(done, 2_000));
await confirm("settle", await freshClient.writeContract({ address: manifest.contracts.attestationRegistry, abi: registryAbi, functionName: "settle", args: [attestationId] }));
const usdtBefore = await publicClient.readContract({ address: manifest.contracts.settlementToken, abi: tokenAbi, functionName: "balanceOf", args: [fresh.address] });
await confirm("claimProceeds", await freshClient.writeContract({ address: manifest.contracts.yieldVault, abi: vaultAbi, functionName: "claimYield", args: [claimId] }));
const usdtAfter = await publicClient.readContract({ address: manifest.contracts.settlementToken, abi: tokenAbi, functionName: "balanceOf", args: [fresh.address] });
if (usdtAfter - usdtBefore !== AMOUNT) throw new Error(`Fresh wallet received ${usdtAfter - usdtBefore}, expected ${AMOUNT}`);
const claim = await publicClient.readContract({ address: manifest.contracts.yieldVault, abi: vaultAbi, functionName: "getClaim", args: [claimId] });
if (Number(claim.status) !== 2) throw new Error(`Fresh wallet claim status is ${claim.status}, expected RELEASED`);

const artifact = { schemaVersion: 1, network: "bot-testnet", chainId: chain.id, site: SITE, wallet: fresh.address, privateKeyIncluded: false, assetLabel, assetId, period: PERIOD, claimId, attestationId, outcome: "SETTLED_AND_FULLY_CLAIMED", amountMinor: AMOUNT.toString(), receivedMinor: (usdtAfter - usdtBefore).toString(), transactions };
await writeFile(resolve(process.cwd(), "../../deployments/bot-testnet/fresh-wallet-production.json"), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
process.stdout.write(`Fresh production wallet completed: ${fresh.address}\n`);
