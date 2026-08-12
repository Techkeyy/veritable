export function attestationRequestMessage(claimId: string, chainId = 968, networkName = "BOT Testnet") {
  return [
    `Veritable ${networkName} attestation request`,
    `Claim: ${claimId}`,
    `Chain: ${chainId}`,
    "Purpose: authorize the bonded verifier to inspect this claim's committed sandbox evidence.",
  ].join("\n");
}
