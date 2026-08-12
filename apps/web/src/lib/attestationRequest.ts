export function attestationRequestMessage(claimId: string) {
  return [
    "VeriFi BOT Testnet attestation request",
    `Claim: ${claimId}`,
    "Chain: 968",
    "Purpose: authorize the bonded verifier to inspect this claim's committed sandbox evidence.",
  ].join("\n");
}
