import { getAddress, type Address, type Hex } from "viem";

export function evidencePreparationMessage(input: {
  requester: Address;
  periodKey: string;
  payerReferenceHash: Hex;
  documentHash: Hex;
  chainId: number;
}) {
  return [
    "Veritable evidence preparation",
    `Requester: ${getAddress(input.requester)}`,
    `Period: ${input.periodKey}`,
    `Payer reference hash: ${input.payerReferenceHash}`,
    `Document hash: ${input.documentHash}`,
    `Chain ID: ${input.chainId}`,
  ].join("\n");
}
