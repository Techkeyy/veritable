import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { network } from "hardhat";
import { zeroHash, type Address, type Hash } from "viem";

const EXPECTED_CHAIN_ID = 968;
const EXPLORER = "https://scan.bohr.life";

interface Manifest {
  chainId: number;
  contracts: { attestationRegistry: Address; yieldVault: Address };
}

interface PublicDemo {
  verification?: Record<string, unknown>;
  transactions: Record<string, { hash: Hash; explorerUrl: string }>;
  claimId: Hash;
  [key: string]: unknown;
}

const { viem, networkName } = await network.create();
if (networkName !== "botTestnet") throw new Error(`Public demo finalization refused on ${networkName}`);
const publicClient = await viem.getPublicClient();
const [deployer] = await viem.getWalletClients();
if (!deployer?.account) throw new Error("Deployer wallet is required");
const chainId = await publicClient.getChainId();
if (chainId !== EXPECTED_CHAIN_ID) throw new Error(`Wrong-chain kill switch: ${chainId}`);

const outDir = resolve(process.cwd(), "../../deployments/bot-testnet");
const manifest = JSON.parse(await readFile(resolve(outDir, "manifest.json"), "utf8")) as Manifest;
const artifactPath = resolve(outDir, "public-demo.json");
const artifact = JSON.parse(await readFile(artifactPath, "utf8")) as PublicDemo;
const registry = await viem.getContractAt("AttestationRegistry", manifest.contracts.attestationRegistry, { client: { wallet: deployer } });
const vault = await viem.getContractAt("YieldVault", manifest.contracts.yieldVault, { client: { public: publicClient } });
const attestationId = await registry.read.claimAttestations([artifact.claimId]) as Hash;
if (attestationId === zeroHash) throw new Error("The public demo claim has not been attested");
let attestation = await registry.read.getAttestation([attestationId]) as { data: { reportHash: Hash; outcome: number }; challengeDeadline: bigint; status: number };

if (attestation.status === 1) {
  while ((await publicClient.getBlock()).timestamp < attestation.challengeDeadline) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 2_000));
  }
  const settleHash = await registry.write.settle([attestationId]);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: settleHash });
  if (receipt.status !== "success") throw new Error(`Public demo settlement reverted: ${settleHash}`);
  artifact.transactions.settle = { hash: settleHash, explorerUrl: `${EXPLORER}/tx/${settleHash}` };
  process.stdout.write(`settle: ${EXPLORER}/tx/${settleHash}\n`);
  attestation = await registry.read.getAttestation([attestationId]) as typeof attestation;
}
if (attestation.status !== 3) throw new Error(`Public demo attestation is not settled (status ${attestation.status})`);
const claim = await vault.read.getClaim([artifact.claimId]) as { status: number };
if (claim.status !== 2) throw new Error(`Public demo claim is not released (status ${claim.status})`);
artifact.verification = {
  ...(artifact.verification ?? {}),
  outcome: "VERIFIED",
  reportHash: attestation.data.reportHash,
  attestationId,
  onchainStatus: "SETTLED_AND_RELEASED",
  idempotencyConfirmed: true,
};
await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
process.stdout.write(`Public demo released: ${artifact.claimId}\n`);
