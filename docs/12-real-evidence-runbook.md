# Real evidence workflow

## Preferred hosted workflow: DeepSeek + signed source + private storage

The public product now prepares provider-backed evidence directly:

1. The issuer connects a wallet and uploads a text-based PDF or plain-text source document.
2. The server extracts bounded text locally and sends it to DeepSeek's JSON-output API. DeepSeek returns a redacted summary, citations, expected amount, and due date. Scanned or empty PDFs fail closed until a separate OCR provider is configured.
3. A separate evidence-source operator supplies a signed payment record. The verifier checks its payload hash, signer identity, signature, freshness, payer reference, amount, and payment date. The AI cannot manufacture or override this record.
4. The original document and canonical evidence bundle are written to private Vercel Blob storage. The browser receives the canonical bundle but is not the authoritative store.
5. The issuer registers the exact DeepSeek-extracted terms and hashed payer reference, then escrows Testnet USDT and commits the bundle hash on BOT Chain.
6. Before attesting, deterministic policy checks the DeepSeek-extracted amount/date against registered terms and the signed source record against the claim.

USD amounts are represented as six-decimal nominal settlement units: one USD is `1_000_000` units. On Testnet, the issuer escrows the same nominal amount of Testnet USDT. This does not assert an FX guarantee and must become an explicit treasury/conversion policy before Mainnet.

Required hosted secrets are `DEEPSEEK_API_KEY` and `BLOB_READ_WRITE_TOKEN`. `DEEPSEEK_MODEL` defaults to `deepseek-v4-pro`. Never expose these values with a `NEXT_PUBLIC_` prefix.

The legacy externally signed bundle workflow below remains supported for recovery and protocol compatibility, but it is no longer the primary user path.

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
