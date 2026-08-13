# Real evidence workflow

Veritable's live verifier accepts no scenario labels, seeded payment outcomes, fixed periods, fixed terms, or server-generated evidence. Every claim commits the canonical hash of an issuer-supplied evidence bundle. The verifier reconstructs the report only from that exact bundle and live BOT Chain state.

## Trust boundary

- The asset issuer chooses and commits the asset terms when the asset is created.
- An evidence-source operator—not the Veritable web server—signs the payment record with a dedicated key.
- The web app hashes the signed evidence bundle and commits that root in `YieldVault.submitClaim`.
- The verifier checks the bundle hash, period, claim amount, registered terms hash, registered policy hash, source signer, source signature, freshness, payer reference, payment date, and payment amount.
- Missing, expired, malformed, mismatched, or incorrectly signed input fails closed.
- Testnet still uses a test settlement token. The web app never auto-mints it during claim submission.

## Prepare an unsigned evidence file

Create an ignored local JSON file with real values:

```json
{
  "periodKey": "YYYY-MM",
  "assetTerms": {
    "expectedAmountMinor": "0",
    "dueDate": "YYYY-MM-DD",
    "windowDays": 0,
    "amountToleranceMinor": "0",
    "payerReferenceHash": "0x..."
  },
  "documents": [
    {
      "id": "source-controlled-id",
      "contentHash": "0x...",
      "mediaType": "application/pdf",
      "kind": "LEASE",
      "extractedText": "Redacted output from the actual extraction run"
    }
  ],
  "modelRunHash": "0x...",
  "paymentRecord": {
    "status": "FOUND",
    "amountMinor": "0",
    "paidAt": "YYYY-MM-DD",
    "payerReferenceHash": "0x...",
    "source": "provider-and-account-reference",
    "issuedAt": "ISO-8601 timestamp",
    "expiresAt": "ISO-8601 timestamp"
  }
}
```

Amounts are six-decimal USDT minor units. Hash sensitive references before they enter this file. `modelRunHash` must identify the actual extraction output or provider run; it must not be a placeholder.

## Sign outside the web server

Keep `EVIDENCE_SIGNER_PRIVATE_KEY` only in the evidence operator's ignored local `.env`, then run:

```text
pnpm evidence:sign ./private/unsigned-evidence.json ./private/signed-evidence.json
```

The command writes the signed bundle, prints its public evidence root, and never prints the private key. Configure only the corresponding public `EVIDENCE_SIGNER_ADDRESS` in the hosted verifier.

## Submit and verify

1. Create an asset using the exact same asset terms and payer-reference hash.
2. Fund the issuer with the configured Testnet settlement token; claim submission does not mint funds.
3. Paste the signed bundle's `documents`, `paymentEnvelope`, and `modelRunHash` into **Submit yield**, together with the matching asset terms and period.
4. Export and retain the complete signed bundle. The browser also keeps a device-local copy keyed by claim ID for convenience.
5. To inspect from another device, paste the exact bundle into **Inspect report**. Any changed byte produces a different root and is rejected.

## Hosted variables

The real-evidence hosted verifier needs:

```text
VERIFIER_PRIVATE_KEY        # secret, bonded BOT Testnet verifier
EVIDENCE_SIGNER_ADDRESS     # public address only
BOT_TESTNET_RPC_URL
```

Do not configure `EVIDENCE_SIGNER_PRIVATE_KEY` on Vercel or Sites. The source signer must remain operationally separate from the verifier.
