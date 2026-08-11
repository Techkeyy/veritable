# AI verification and evidence design

## 1. Load-bearing module

The riskiest module is not document upload or wallet connection. It is the verifier pipeline that must produce a reproducible, defensible result from imperfect evidence and turn that result into a safe on-chain action.

Phase 1 builds this module in isolation before the product UI.

## 2. Evidence bundle

Canonical input:

```json
{
  "claimId": "bytes32",
  "assetId": "bytes32",
  "periodKey": "2026-08",
  "claimedAmountMinor": "2000000000",
  "currency": "USDT",
  "assetTerms": {
    "expectedAmountMinor": "2000000000",
    "dueDate": "2026-08-01",
    "windowDays": 5,
    "amountToleranceMinor": "0",
    "payerReferenceHash": "0x..."
  },
  "documents": [],
  "paymentRecords": [],
  "evidenceRoot": "0x..."
}
```

Use integer minor units everywhere. No floating-point money.

## 3. Pipeline

1. **Detect:** receive/recover `YieldClaimSubmitted` and deduplicate it.
2. **Fetch:** retrieve the exact evidence bundle whose hash was committed.
3. **Validate source:** verify content hashes, MIME/size limits, timestamps, and the payment source's signature.
4. **Extract:** use OCR/model structured output to produce typed candidate facts.
5. **Normalize:** dates, minor units, references, and canonical strings.
6. **Cross-check:** compare independent sources and identify contradictions.
7. **Decide:** run deterministic policy version `policy-v1`.
8. **Report:** persist a public-redacted deterministic report and its canonical hash.
9. **Sign:** create an EIP-712 attestation with nonce/deadline.
10. **Act:** relay transaction, confirm receipt and emitted event, persist the result.

Each stage is a separate testable module. The full raw model chain-of-thought is neither required nor stored; store concise evidence citations and rule results.

## 4. Deterministic policy v1

Required checks:

- bundle and every referenced object pass hash verification;
- registered terms and claim refer to the same asset/period;
- official settlement currency matches;
- payment record source signature is valid;
- detected payer reference matches the registered redacted reference;
- detected amount matches the claimed/expected amount within configured tolerance;
- payment date falls within the allowed window;
- no unresolved contradiction exists between primary sources;
- all required fields have adequate provenance.

Decision table:

| Condition | Outcome |
|---|---|
| All required checks pass | `VERIFIED` |
| Definite amount/source/date contradiction or signed record shows absence | `BLOCKED` |
| Missing, unreadable, stale, unsigned, or ambiguous evidence | `INCONCLUSIVE` |

The model may flag anomalies and explain failures, but cannot override the table.

## 5. AI responsibilities

Real AI work:

- extract lease terms from unstructured files;
- associate document fields with schema fields and source locations;
- detect contradictory names, dates, references, and altered-document indicators;
- classify document type and evidence relevance;
- generate a short, source-cited explanation of deterministic rule results.

Non-AI responsibilities:

- money arithmetic;
- hash/signature verification;
- time-window comparison;
- final outcome selection;
- blockchain authorization;
- stake/slash accounting.

If the model API is unavailable, automatic approval is impossible. The worker emits `INCONCLUSIVE`, retains escrow, and offers a retry. Committed golden fixtures keep local tests reproducible but are clearly marked.

## 6. Payment oracle sandbox

The hackathon sandbox service is operationally separate from the issuer UI. It exposes pre-seeded payment records signed by a dedicated evidence-source key. The issuer cannot edit a record after the claim is submitted.

Routes:

```text
GET /v1/payments/:reference
POST /v1/demo/scenario/:scenarioId/reset   # protected demo admin only
GET /v1/health
GET /v1/public-key
```

Every response includes canonical payload, source, issued-at, expiry, and signature. The verifier rejects expired or invalid responses.

Demo scenarios:

- `rent-paid-exact`: 2,000 USDT equivalent detected;
- `rent-underpaid`: 1,200 detected against a 2,000 claim;
- `rent-missing`: no qualifying record;
- `false-positive-trap`: misleading screenshot but signed payment record disagrees;
- `ambiguous-evidence`: required record unavailable, producing `INCONCLUSIVE`.

## 7. Report schema

```text
reportVersion
claimId / assetId / periodKey
inputEvidenceRoot
sourceChecks[]
extractedFacts[] { field, value, sourceHash, locator }
ruleResults[] { ruleId, pass/fail/unknown, evidenceRefs[] }
outcome
verifiedAmountMinor
limitations[]
policyHash
modelProvider/model/version/promptHash
createdAt
```

The public report redacts identities and sensitive financial data. `reportHash` commits to the immutable report bytes; changing prose requires a new report/version.

The public API exposes `GET /v1/reports/:claimId`. It returns only the redacted rule results, limitations, policy/terms commitments, and transaction references; raw documents, payer identities, keys, retry counters, and worker cursors remain private.

## 8. API boundaries

All inbound/outbound payloads use shared Zod/JSON schemas. The API never trusts model JSON, browser-provided amounts, MIME extensions, or database enums without validation.

Key idempotency keys:

- uploads: content SHA-256;
- claim worker: chain/log identity;
- verifier run: `(claimId, evidenceRoot, policyHash)`;
- relay: EIP-712 nonce plus attestation digest;
- notifications: `(wallet, eventType, entityId)`.

The worker recovers logs in block/log order from a durable cursor. It advances the cursor only after every claim in a block is terminal, retries transient failures on a bounded interval, and moves persistent failures to `DEAD_LETTER` without producing an attestation. `INCONCLUSIVE` is a safe terminal report and never submits an on-chain approval.

## 9. Agent key policy

- dedicated verifier key, separate from deployer/resolver;
- minimum operating BOT only;
- encrypted secret in hosting provider secret storage;
- never exposed to the browser or logs;
- transaction simulation before relay where supported;
- allowlisted contract, chain ID, and method selectors;
- daily transaction/value limits at the service layer;
- emergency stop independent of contract pause.
