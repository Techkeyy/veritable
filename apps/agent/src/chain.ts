import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  stringToHex,
  type Address,
  type Chain,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { VerificationReport } from "@veritable/schemas";
import type { ClaimEvent } from "./store.js";

export const yieldClaimEventAbi = [
  {
    type: "event",
    name: "YieldClaimSubmitted",
    inputs: [
      { indexed: true, name: "claimId", type: "bytes32" },
      { indexed: true, name: "assetId", type: "bytes32" },
      { indexed: true, name: "periodKey", type: "bytes32" },
      { indexed: false, name: "issuer", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
      { indexed: false, name: "evidenceRoot", type: "bytes32" },
      { indexed: false, name: "snapshotId", type: "uint256" },
    ],
  },
] as const;

export const attestationRegistryAbi = [
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

export interface ChainSubmitterConfig {
  chain: Chain;
  rpcUrl: string;
  registryAddress: Address;
  verifierPrivateKey: Hex;
  modelRunHash: Hex;
}

export function createChainSubmitter(config: ChainSubmitterConfig) {
  const account = privateKeyToAccount(config.verifierPrivateKey);
  const publicClient = createPublicClient({ chain: config.chain, transport: http(config.rpcUrl) });
  const walletClient = createWalletClient({ chain: config.chain, transport: http(config.rpcUrl), account });

  return async (event: ClaimEvent, report: VerificationReport, reportHash: string) => {
    const nonce = await publicClient.readContract({
      address: config.registryAddress,
      abi: attestationRegistryAbi,
      functionName: "nonces",
      args: [account.address],
    });
    const latestBlock = await publicClient.getBlock();
    const data = {
      claimId: event.claimId as Hex,
      assetId: event.assetId as Hex,
      periodKey: event.periodKey as Hex,
      claimedAmount: BigInt(event.amountMinor),
      verifiedAmount: BigInt(report.verifiedAmountMinor),
      outcome: report.outcome === "VERIFIED" ? 1 : 2,
      evidenceRoot: event.evidenceRoot as Hex,
      reportHash: reportHash as Hex,
      policyHash: keccak256(stringToHex(report.policyVersion)),
      termsHash: report.termsHash as Hex,
      modelRunHash: config.modelRunHash,
      nonce,
      deadline: latestBlock.timestamp + 900n,
    } as const;
    const signature = await walletClient.signTypedData({
      account,
      domain: {
        name: config.chain.id === 968 ? "VeriFi Attestation Registry" : "Veritable Attestation Registry",
        version: "1",
        chainId: config.chain.id,
        verifyingContract: config.registryAddress,
      },
      types: {
        Attestation: [
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
      primaryType: "Attestation",
      message: data,
    });
    const { request } = await publicClient.simulateContract({
      account,
      address: config.registryAddress,
      abi: attestationRegistryAbi,
      functionName: "submitAttestation",
      args: [data, signature],
    });
    const transactionHash = await walletClient.writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
    if (receipt.status !== "success") throw new Error(`Attestation transaction reverted: ${transactionHash}`);
    return transactionHash;
  };
}
