import { getAddress, type Address, type Hex } from "viem";

export function evidencePreparationMessage(input: {
  requester: Address;
  periodKey: string;
  proofReference: string;
  documentHash: Hex;
  chainId: number;
}) {
  return [
    "Veritable evidence preparation",
    `Requester: ${getAddress(input.requester)}`,
    `Period: ${input.periodKey}`,
    `Payment proof: ${input.proofReference}`,
    `Document hash: ${input.documentHash}`,
    `Chain ID: ${input.chainId}`,
  ].join("\n");
}

export function evidenceRequestMessage(input: {
  issuer: Address;
  payer: Address;
  periodKey: string;
  amountMinor: string;
  paidAt: string;
  documentHash: Hex;
  chainId: number;
}) {
  return [
    "Veritable payer confirmation request",
    `Issuer: ${getAddress(input.issuer)}`,
    `Payer: ${getAddress(input.payer)}`,
    `Period: ${input.periodKey}`,
    `Amount minor: ${input.amountMinor}`,
    `Paid at: ${input.paidAt}`,
    `Document hash: ${input.documentHash}`,
    `Chain ID: ${input.chainId}`,
  ].join("\n");
}
