# HANDOVER

Written 2026-08-21. Reflects the repository exactly as it stands at commit `ac537dc`.

Notation used for implementation state:

```
- [x] Implemented and verified working
- [~] Partially implemented
- [ ] Not implemented
- [!] Broken or blocked
```

---

## 1. Project Identity

**Name:** Veritable (repository `veritable`, product `Veritable`)

**One sentence:** An economically accountable verification layer that proves real world asset income actually arrived before any of it is distributed to token holders.

**Context:** Built for the **BOT Chain Builder Challenge #2 (AI x RWA)**. Primary track is **RWA Applications**, with AI as a core on-chain decision participant. Submission deadline is **2026-08-22, 23:59 UTC+8**.

**Problem being solved:** RWA tokenization proves a token exists and who owns it. It does not prove the underlying asset earned the income being paid out. Platforms distribute whatever the issuer reports. Veritable inserts a programmable firewall between the issuer's claim and investor payout.

**Intended users:** asset issuers (landlords, revenue owners) and retail investors buying fractional income shares.

**Current phase:** Testnet product complete and working. Mainnet contracts deployed but no product running on top of them yet. Demo video not recorded. Not yet submitted.

**Repository:** https://github.com/Techkeyy/veritable (public)

**Current branch:** `codex/testnet-build`, upstream `origin/main`. Working tree clean, in sync.

**Live product:** https://veritable-web-sigma.vercel.app (BOT Chain **Testnet**, chain 968)

**Networks:**
- BOT Chain Testnet, chain ID **968**, RPC `https://rpc.bohr.life`, explorer `https://scan.bohr.life`
- BOT Chain Mainnet, chain ID **677**, RPC `https://rpc.botchain.ai`, explorer `https://scan.botchain.ai`

**Plain English:** an issuer says "this property earned 2,000 USDT in August". They escrow that money instead of distributing it. An AI model reads their evidence document and extracts the amount and due date. Eight deterministic rules then check that extraction against registered terms and against a real on-chain payment. A verifier who has posted a BOT bond signs an attestation of the result. If it says VERIFIED, the vault releases exactly the escrowed amount to shareholders. If anyone proves the attestation wrong during the challenge window, the verifier loses its bond.

---

## 2. Original Goal / Product Vision

**What we set out to build:** a "yield firewall" for tokenized RWA income. The core differentiator is not that AI reads documents. It is that the entity signing off is **financially liable for being wrong**.

**Intended user flow:**
1. Issuer registers a property, minting a fixed-supply revenue-share token
2. Issuer lists inventory in a public fixed-price offering
3. Any investor buys shares with USDT, paying the issuer directly
4. Monthly, the issuer escrows claimed income and submits evidence
5. AI extracts typed facts; deterministic policy produces a verdict
6. A bonded verifier attests on chain
7. Challenge window opens; anyone can dispute by posting a bond
8. If unchallenged and VERIFIED, holders withdraw against an immutable snapshot

**Core differentiator, stated as the pitch line:** *"The verifier lost its own money for being wrong."*

**Design philosophy that must not be undone:** the LLM **narrates, it does not decide**. Extraction produces typed facts. Deterministic rules produce the verdict. This is what makes the system testable, reproducible, and trustworthy. Any change that lets a model output a verdict directly destroys the project's central claim.

**Hackathon requirements** (from the official brief):

| Requirement | Mandatory | Status |
|---|---|---|
| BOT Chain Mainnet deployment | Required | Met |
| Publicly verifiable product, complete loop | Required | Met (on testnet) |
| Wallet connection completing core flow | Required | Met |
| Public website / online demo | Required | Met |
| GitHub repository | Required | Met |
| Project originality | Required | Met |
| Demo video | Recommended | **Not done** |

Judging weights: Product Completion 30%, Mainnet Integration & Deployment Quality 25%, Innovation 20%, UX 15%, Technical Quality 10%.

---

## 3. Current State — Executive Summary

**Works right now:**
- Complete end-to-end loop on BOT Testnet through the public site
- 60 automated tests passing
- `pnpm audit:testnet` returns **46 of 46** live checks against the deployed chain
- A genuine real-evidence canonical claim, VERIFIED on all eight rules, settled and distributed
- Mainnet contracts deployed, role-separated, verifier bonded

**Does not work / not done:**
- Mainnet has **no product on top of it**. The public frontend still serves testnet.
- No income claim has ever settled on mainnet.
- Demo video not recorded. `SUBMISSION.md` still contains `[PUBLIC_DEMO_VIDEO_URL]`.
- No linter or formatter is configured anywhere in the repo.

**Biggest blocker:** two things the previous agent could not do, both requiring the human operator:
1. **Vercel environment configuration** for a mainnet deployment. No Vercel CLI or token exists in the repo or `.env`.
2. **Real USDT on BOT Chain mainnet.** Every project wallet holds 0 USDT, and official USDT has no public `mint()`.

**Highest-risk area:** the gap between "contracts deployed on mainnet" and "product running on mainnet". The challenge rules explicitly warn that *"simply copying contracts or completing a superficial deployment will not be considered as meeting participation requirements."* Eligibility is satisfied, but the 25% mainnet criterion is weaker than it could be.

**Most important next action:** record the demo video. It is a recommended submission field, it is currently empty, it takes real time, and it is **not blocked by anything**. The script is written and ready at `docs/11-demo-production-sheet.md`.

---

## 4. Architecture

```text
                      ISSUER (browser wallet)
                               │
                               ▼
        ┌──────────────────────────────────────────────┐
        │  apps/web  (Next.js, single network per build)│
        │                                               │
        │  UI: / , /app (Report|Track) , /marketplace   │
        │                                               │
        │  API routes (server-side, runtime=nodejs):    │
        │   /v1/evidence/prepare   → DeepSeek + Blob    │
        │   /v1/evidence/requests  → payer confirmation │
        │   /v1/process/[claimId]  → verify + attest    │
        │   /v1/reports/[claimId]  → deterministic report│
        └───────┬───────────────────────┬───────────────┘
                │                       │
                ▼                       ▼
      DeepSeek API              Vercel Blob (private)
      (extraction only)         (evidence bundles, docs)
                │
                ▼
     packages/policy  ── evaluateClaim() ── 8 deterministic rules
                │
                ▼
        ┌──────────────────────────────────────────────┐
        │            BOT Chain (968 or 677)             │
        │                                               │
        │  AssetRegistry ── AssetFactory ── RevenueShareToken
        │        │                                      │
        │  PrimaryOfferingMarketplace                   │
        │        │                                      │
        │  YieldVault ◄──── AttestationRegistry ◄── VerifierStaking
        └──────────────────────────────────────────────┘

     apps/agent (optional, off-chain watcher)
       polls YieldVault events → runs verification → attests
```

**Data flow for the core loop:**

1. Issuer uploads a document plus a payment proof reference to `/v1/evidence/prepare`
2. Server verifies the issuer's wallet signature, resolves the payment proof **from chain**, calls DeepSeek for extraction, writes document and bundle to Vercel Blob, returns a canonical `EvidenceBundle`
3. Client computes `hashCanonical(bundle)` as `evidenceRoot` and `hashCanonical(bundle.assetTerms)` as `termsHash`
4. Client calls `AssetFactory.createAsset(...)` then `YieldVault.submitClaim(assetId, periodKey, amount, evidenceRoot)`
5. Client signs an attestation-request message and POSTs it with the bundle to `/v1/process/[claimId]`
6. Server re-reads the claim from chain, re-validates the payment proof, re-runs deterministic policy, persists the bundle durably, then signs an EIP-712 attestation with the bonded verifier key and submits it
7. After the challenge window, anyone calls `AttestationRegistry.settle(attestationId)`
8. Holders call `YieldVault.claimYield(claimId)` and receive their snapshot share

**Critical architectural property:** the server **never trusts** the client bundle. `serverVerifier.ts:136` requires `hashCanonical(bundle) === onchain evidenceRoot`, and `:137` requires the terms hash to match the registered commitment. A tampered bundle cannot produce an attestation.

---

## 5. Repository Map

```text
apps/
  web/                          Next.js app. The product. Single network per build.
    src/app/
      page.tsx                  Landing. Headings: "Bring the proof",
                                "Make truth contestable", "Release verified yield"
      app/page.tsx              THE MAIN FILE. Report + Track jobs, ~650 lines.
                                Asset creation, escrow, claim submission, report
                                inspection, marketplace listing, staking.
      marketplace/page.tsx      "Property offerings" / "Your holdings"
      attest/[requestId]/page.tsx  Payer-confirmation signing page
      v1/evidence/prepare/route.ts    DeepSeek extraction + Blob storage
      v1/evidence/requests/…          Payer confirmation request lifecycle
      v1/process/[claimId]/route.ts   Hosted verifier: verify, persist, attest
      v1/reports/[claimId]/route.ts   Public deterministic report
    src/lib/
      chain.ts                  Network selection. isMainnet, activeChain,
                                contracts{}, writesEnabled, wagmiConfig
      serverVerifier.ts         buildPublicVerification(), processPublicClaim(),
                                validatePayment(). The trust core.
      paymentProofs.ts          envelopeFromBotTransaction(), counterparty flows,
                                payerReferenceHash()
      evidenceStorage.ts        Vercel Blob read/write for bundles and documents
      liveProviders.ts          DeepSeek call, prepareLiveEvidence()
      contractErrors.ts         NEW. Decodes custom contract errors into readable
                                messages. See section 16.
      abis.ts                   Hand-written ABIs. NOTE: contains no error entries.
      session.ts                Device-local session and evidence recall
    scripts/
      fresh-wallet-production.mjs   STALE, see section 12
  api/                          Standalone evidence API (local dev path)
  agent/                        Off-chain watcher. runner.ts enforces ALLOW_MAINNET.

packages/
  contracts/contracts/
    AssetRegistry.sol           Asset records, issuer, policyHash, termsHash
    AssetFactory.sol            createAsset(). PERMISSIONLESS.
    RevenueShareToken.sol       ERC20 + snapshot, fixed supply
    PrimaryOfferingMarketplace.sol  list() / buy() / cancel(). buy() permissionless.
    YieldVault.sol              submitClaim, settle hooks, claimYield, refund
    AttestationRegistry.sol     EIP-712 attestations, challenge, resolve, settle
    VerifierStaking.sol         stake(), lock, slash, requestUnstake
  policy/src/evaluate.ts        THE RULE ENGINE. 8 rules, outcome derivation.
  schemas/                      Zod schemas shared by every layer
  config/                       Network/address resolution
  doctor/                       Preflight health check. Has ZERO tests.

scripts/
  audit-testnet-completion.ts   46 live checks. `pnpm audit:testnet`
  preflight-mainnet.ts          27 read-only mainnet checks, no broadcast
  canonical-claim.mjs           NEW. Produces a real-evidence canonical claim.
                                Network-aware via CHAIN_ENV.
  init-mainnet-env.mjs          NEW. Generates mainnet role identities.
  estimate-mainnet-gas.mjs      NEW. Read-only gas estimate via eth_estimateGas.
  init-testnet-env.ts           Generates testnet identities
  sign-evidence.ts              Legacy externally-signed bundle path

deployments/
  bot-testnet/manifest.json     Deployed addresses, roles, parameters
  bot-testnet/acceptance.json   Verified + challenged/slashed acceptance run
  bot-testnet/canonical-claim.json   NEW. The current canonical claim.
  bot-testnet/completion-audit.json  46/46 result
  bot-testnet/public-site.json       HISTORICAL. Points at a retired host.
  bot-testnet/fresh-wallet-production.json  HISTORICAL. Same.
  bot-mainnet/manifest.json     LIVE MAINNET DEPLOYMENT
  bot-mainnet/readiness.json    Preflight output

docs/00 … docs/12                Planning through runbooks
docs/11-demo-production-sheet.md THE DEMO SCRIPT. Ready to record.
docs/12-real-evidence-runbook.md Real evidence workflow
SUBMISSION.md                    Submission dossier. HAS ONE PLACEHOLDER LEFT.
README.md                        Rewritten this session, claims are current
```

**Files the next agent will almost certainly touch:** `apps/web/src/app/app/page.tsx`, `apps/web/src/lib/chain.ts`, `scripts/canonical-claim.mjs`, `SUBMISSION.md`.

---

## 6. Tech Stack

| Technology | Where | Why / notes |
|---|---|---|
| **pnpm 11.16.0** | root `packageManager` | Workspace monorepo. **Not installed globally on the dev machine.** See section 12. |
| **Node >=24 <25** | `engines`, `.nvmrc` = 24.14.0 | CI uses `.nvmrc` |
| **TypeScript 5.9.3** | everywhere | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` all on. Zero `any` in src. Zero `@ts-ignore`. |
| **Next.js (App Router)** | `apps/web` | API routes run `runtime = "nodejs"`, `dynamic = "force-dynamic"` |
| **wagmi + viem 2.55.13** | frontend + all scripts | `injected()` connector only |
| **Hardhat** | `packages/contracts` | Mocha-style tests, 19 passing |
| **OpenZeppelin** | contracts | AccessControl, ERC20Snapshot, EIP712, ECDSA, ReentrancyGuard |
| **Vitest 4.1.10** | all TS packages | 41 tests outside contracts |
| **Zod** | `packages/schemas` | Runtime validation of every bundle |
| **DeepSeek** (`deepseek-v4-pro`) | `liveProviders.ts` | Extraction only, never verdicts |
| **Vercel Blob** | `evidenceStorage.ts` | Private durable evidence storage |
| **Vercel** | hosting | Project `veritable-web`, `.vercel/project.json` |
| **vinext** 1.0.0-beta.2 | `build:sites` | Legacy ChatGPT Sites build. Produces `.release/*.tar.gz`. See section 15. |

**No linter or formatter is configured.** No ESLint, Prettier, or Biome config exists, and no workspace has a `lint` script. There is one vestigial `// eslint-disable-next-line react-hooks/exhaustive-deps` in `app/page.tsx` for a rule nothing enforces.

---

## 7. How to Run the Project

**Prerequisite gotcha, verified this session:** `pnpm` is **not** on the PATH of this dev machine. `corepack` is. Either:

```bash
corepack enable --install-directory <some-dir-on-PATH>
```

or prefix commands with `corepack pnpm`. Note that `pnpm test` internally spawns `pnpm` for each workspace, so `corepack pnpm test` alone fails partway. The shim approach is required.

```bash
pnpm install --frozen-lockfile
pnpm test          # 60 tests
pnpm typecheck
pnpm build
pnpm audit --prod --audit-level high
```

Local development, three processes:

```bash
pnpm dev:api       # evidence API, default port 4100
pnpm dev:agent     # off-chain watcher
pnpm dev:web       # Next.js, default port 3000
```

Testnet operations:

```bash
pnpm init:testnet-env
pnpm run doctor -- --network bot-testnet --wallets
pnpm deploy:testnet          # requires chain 968
pnpm acceptance:testnet
pnpm audit:testnet           # 46 live checks
pnpm canonical:testnet       # real-evidence canonical claim
```

Mainnet operations:

```bash
pnpm preflight:mainnet       # read-only, no broadcast
pnpm deploy:mainnet          # LOCKED, see section 8
CHAIN_ENV=bot-mainnet CANONICAL_AMOUNT=0.5 pnpm canonical:testnet
```

**There is no lint command. Do not invent one.**

---

## 8. Environment Variables and Configuration

`.env` is gitignored (`.gitignore:13`). **No secrets are committed.** Verified: the two tracked `.env` files under `deployments/bot-testnet/` contain only public addresses and RPC URLs.

**Testnet operational**

```text
CHAIN_ENV                        bot-testnet | bot-mainnet. Selects network.
BOT_TESTNET_RPC_URL              https://rpc.bohr.life
DEPLOYER_PRIVATE_KEY=<REDACTED>  Testnet deployer/issuer. Required for scripts.
VERIFIER_PRIVATE_KEY=<REDACTED>  Bonded testnet verifier. Signs attestations.
EVIDENCE_SIGNER_PRIVATE_KEY=<REDACTED>  Legacy evidence-signer path only.
EVIDENCE_SIGNER_ADDRESS          Public address of the above. Server-side check.
RESOLVER_PRIVATE_KEY             Currently EMPTY.
```

**Mainnet**

```text
ALLOW_MAINNET_DEPLOYMENT         Must equal exactly
                                 DEPLOY_VERITABLE_TO_BOT_MAINNET_677
                                 Currently SET (deployment already executed).
ALLOW_MAINNET                    Must equal "true". SEPARATE runtime lock.
                                 Agent runner and hosted verifier both refuse
                                 chain 677 without it. Currently "true" locally.
MAINNET_DEPLOYER_PRIVATE_KEY=<REDACTED>   Wallet 0xCc67779F…
MAINNET_VERIFIER_PRIVATE_KEY=<REDACTED>
MAINNET_ADMIN_PRIVATE_KEY=<REDACTED>      Generated this session
MAINNET_GUARDIAN_PRIVATE_KEY=<REDACTED>
MAINNET_RESOLVER_PRIVATE_KEY=<REDACTED>
MAINNET_TREASURY_PRIVATE_KEY=<REDACTED>
MAINNET_EVIDENCE_SIGNER_PRIVATE_KEY=<REDACTED>
MAINNET_*_ADDRESS                Public addresses, listed in section 21
MAINNET_VERIFIER_BOND_BOT        0.2
MAINNET_CHALLENGER_BOND_BOT      0.02
MAINNET_CHALLENGE_WINDOW_SECONDS 600     (contract enforces >= 300)
MAINNET_UNSTAKE_COOLDOWN_SECONDS 86400
MAINNET_BLOCKED_REFUND_DELAY_SECONDS 600 (must be >= challenge window)
```

**Hosted secrets, exist only on Vercel, absent locally**

```text
DEEPSEEK_API_KEY=<REDACTED>      Consumed by liveProviders.ts
DEEPSEEK_MODEL                   defaults deepseek-v4-pro
BLOB_READ_WRITE_TOKEN=<REDACTED> Consumed by evidenceStorage.ts
```

Because these are absent locally, **the mainnet canonical claim cannot be run from a dev machine.** It requires a hosted deployment configured for mainnet.

**Frontend, build-time inlined**

```text
NEXT_PUBLIC_CHAIN_ENV                Set to "bot-mainnet" to switch networks.
                                     ABSENT on Vercel today, so site = testnet.
NEXT_PUBLIC_ALLOW_MAINNET_WRITES     Must equal exactly
                                     ENABLE_VERITABLE_MAINNET_WRITES_677
NEXT_PUBLIC_BOT_MAINNET_RPC_URL
NEXT_PUBLIC_CHALLENGER_BOND_BOT
NEXT_PUBLIC_CHALLENGE_WINDOW_SECONDS
NEXT_PUBLIC_ASSET_REGISTRY_ADDRESS
NEXT_PUBLIC_ASSET_FACTORY_ADDRESS
NEXT_PUBLIC_YIELD_VAULT_ADDRESS
NEXT_PUBLIC_ATTESTATION_REGISTRY_ADDRESS
NEXT_PUBLIC_VERIFIER_STAKING_ADDRESS
NEXT_PUBLIC_SETTLEMENT_TOKEN_ADDRESS
NEXT_PUBLIC_MARKETPLACE_ADDRESS      Read by chain.ts:56
```

Ready-to-paste mainnet values are in `deployments/bot-mainnet/web.env` and `agent.env`.

**Documented but unused:** `BOT_MAINNET_CHAIN_ID`, `BOT_MAINNET_WSS_URL`, `BOT_TESTNET_CHAIN_ID`, `DATABASE_URL`, `ISSUER_ADDRESS`, `HOLDER_A_ADDRESS`, `HOLDER_B_ADDRESS`, `MODEL_API_KEY`, `MODEL_RUN_HASH`. Harmless, mildly confusing.

---

## 9. Current User Flow

Everything below describes the **testnet** deployment at https://veritable-web-sigma.vercel.app.

**Landing `/`** — three scroll sections. No wallet needed. Fully functional.

**Marketplace `/marketplace`** — "Property offerings" and "Your holdings". Browsing needs no wallet. Buying calls `Marketplace.buy(listingId, shareAmount, maxCostMinor)`, which is permissionless. **Known UI hazard:** the server-rendered HTML contains the string "No listings yet"; listings load client-side. Fully functional once hydrated.

**App `/app`** — header "Prove the yield, then get paid." Two jobs, **Report** and **Track**, plus **Connect** and **Download sample**.

*Report job, the full issuer path:*
1. Connect wallet (injected)
2. `Download sample` provides a usable evidence document
3. Upload document, choose payment proof: **Testnet payment** (paste a TestUSDT transfer hash) or **Payer confirmation** (send a signature link)
4. Consent checkbox for sending extracted text to DeepSeek
5. `Report this month's income` triggers, in order:
   - `AssetFactory.createAsset(...)` where `assetId = keccak256(propertyName)`
   - `settlementToken.approve(vault, amount)`
   - `YieldVault.submitClaim(assetId, keccak256(periodKey), amount, evidenceRoot)`
   - wallet signature authorizing the verifier
   - `POST /v1/process/[claimId]`

Handled in `apps/web/src/app/app/page.tsx` around lines 360-500. Fully functional.

*Track job:* paste or load a claim ID, `POST /v1/reports/[claimId]`, renders outcome plus rule list. If the browser has no stored bundle it falls back to durable storage, so a claim is only inspectable on the deployment holding its bundle.

**Attest page `/attest/[requestId]`** — payer reviews bound facts and signs. Functional, less exercised.

---

## 10. Implemented Features

**Fixed-supply asset issuance — COMPLETE.** `AssetFactory.sol`, `RevenueShareToken.sol`. Permissionless: `AssetFactory.sol:61` registers `msg.sender` as issuer with no role check. Supply permanently locked at creation. Test: create an asset from a fresh wallet.

**Primary offering marketplace — COMPLETE.** `PrimaryOfferingMarketplace.sol`. `buy()` has no role gate. Verified by completion-audit check "Fresh investor purchases live marketplace shares".

**Escrowed income claims — COMPLETE.** `YieldVault.sol`. One claim per asset per period, enforced by `PeriodAlreadyClaimed`.

**Live AI extraction — COMPLETE.** `liveProviders.ts` via `/v1/evidence/prepare`. Real DeepSeek call. Documents get IDs prefixed `deepseek:` which is exactly how `serverVerifier.ts:151` decides `extractionRequired`.

**Deterministic policy — COMPLETE.** `packages/policy/src/evaluate.ts`, 14 unit tests. Eight rules:

```
AI_EXTRACTION_PRESENT   only when extractionRequired
AI_TERMS_MATCH          only when extractionRequired
SOURCE_PROOF_VALID
SOURCE_RECORD_FRESH
PAYMENT_PRESENT
AMOUNT_MATCHES          only when payment status FOUND
PAYER_MATCHES           only when payment status FOUND
DATE_IN_WINDOW          only when payment status FOUND
```

Outcome derivation, `evaluate.ts:141-144`: any `UNKNOWN` → `INCONCLUSIVE`; else any `FAIL` → `BLOCKED`; else `VERIFIED`. `verifiedAmountMinor` is `"0"` unless `VERIFIED`. **This is the key invariant. Do not weaken it.**

**On-chain payment proof — COMPLETE.** `paymentProofs.ts` `envelopeFromBotTransaction()` re-reads the transfer from chain and matches token, sender, recipient, and exact amount. Requires no server secret, which makes it the most robust of the three proof paths.

**Bonded attestation with challenge and slash — COMPLETE and PROVEN ON CHAIN.** Testnet evidence: verifier stake went 5 → 3 tBOT and 1,500 USDT was refunded. Transactions listed in section 21.

**Hosted verifier — COMPLETE.** `/v1/process/[claimId]`. Requires the on-chain claim issuer's signature (`serverVerifier.ts:172`), rejects non-issuers with 403, rejects missing auth with 400, and is idempotent (returns `ALREADY_SUBMITTED`).

**Contract error decoding — COMPLETE, added at the very end of this session.** `apps/web/src/lib/contractErrors.ts`. See section 16.

**Mainnet deployment — COMPLETE.** See section 21.

**Testnet completion audit — COMPLETE.** 46 checks, all passing.

---

## 11. Unfinished Features

**[!] Mainnet product.** Contracts exist; nothing runs on them. Needs Vercel env config (human) plus real USDT. Blocked, not coded around.

**[ ] Demo video.** Script complete at `docs/11-demo-production-sheet.md`. Nothing blocks recording.

**[~] `apps/agent` off-chain watcher.** Code exists (`runner.ts`, `processor.ts`, `store.ts`), 11 tests pass. Not part of the demoed path; the hosted verifier route is used instead. Not verified end-to-end this session.

**[ ] Multi-agent verifier consensus.** Design only. Single verifier is a disclosed limitation.

**[ ] Decentralized dispute resolution.** Single `RESOLVER_ROLE` address.

**[ ] Linter and formatter.** None configured. Deliberately not added days before a deadline.

---

## 12. Current Bugs / Problems

### 12.1 `acceptance:fresh-production` script is stale — HIGH

**Problem:** `apps/web/scripts/fresh-wallet-production.mjs` cannot succeed against the current verifier.

**Location:** the script; `apps/web/src/app/v1/process/[claimId]/route.ts:33`.

**Cause:** two independent breaks. (a) the route now **requires** `body.evidenceBundle` and returns 400 without it; the script posts only `{requester, signature}`. (b) the script commits `evidenceRoot = keccak256(stringToHex("evidence:exact-payment"))`, a fixture label hash, but `serverVerifier.ts:136` requires `hashCanonical(bundle) === evidenceRoot`, which no real bundle can satisfy.

**Also:** its attestation message string still says "committed sandbox evidence" while `attestationRequest.ts` now says "committed evidence".

**Tried:** its default URL was repointed to the Vercel site. That does not fix the logic.

**Hypothesis:** it is superseded by `scripts/canonical-claim.mjs`. Either delete it or rewrite it onto the real-evidence path.

**Severity:** High for anyone who runs it expecting it to work. It is not on any critical path.

### 12.2 The legacy canonical claim can never be re-verified — INFORMATIONAL

**Problem:** claim `0xd4cf42cb…` cannot be reproduced by the current verifier.

**Cause:** its on-chain `evidenceRoot` is `keccak256("evidence:exact-payment")`, a label hash from an older server-generated-evidence design. No `EvidenceBundle` hashes to a string literal.

**Result:** the claim is served only by a **retired** ChatGPT Sites deployment that still generates fixtures server-side.

**Resolution:** replaced by `0x1b547def…`, which is strictly stronger. Do not attempt to restore the old claim.

**Severity:** Informational. Documented so nobody re-litigates it.

### 12.3 Vercel env anomalies — MEDIUM, NEEDS VERIFICATION

Observed in a screenshot of the Vercel dashboard:
- `NEXT_PUBLIC_ASSET_FACTORY_ADDRESS` is scoped **Preview only**, while every sibling is "Production and Preview". If accurate, `contracts.assetFactory` is `undefined` in production and asset creation via the production UI would fail.
- `NEXT_PUBLIC_MARKETPLACE_ADDRESS` did not appear in the list at all, yet `chain.ts:56` reads it.

**Caveat:** that list was demonstrably incomplete. `DEEPSEEK_API_KEY` and `BLOB_READ_WRITE_TOKEN` were also absent from it, yet both provably work in production. Some variables likely live in the **Shared** tab. **Verify before acting.**

**Severity:** Medium if real, since it would break the primary issuer flow in production.

### 12.4 `PeriodAlreadyClaimed` during demo recording — RESOLVED, not a bug

**Symptom:** UI showed `Yield claim reverted`; MetaMask showed "Transaction failed".

**Diagnosis:** failed tx `0x918ba333…` replayed via `eth_call` returned selector `0xb0853b87` = `PeriodAlreadyClaimed(bytes32,bytes32)` for assetId `0xa1d53906…` and periodKey `keccak256("2026-08")`. A `2026-08` claim already existed for that property from an earlier take.

**Fix for the operator:** `assetId = keccak256(propertyName)`, so use a **different property name**, or a different period.

**Product fix applied:** `contractErrors.ts` now decodes this into *"This property already has a claim for that period…"*.

### 12.5 Zerion wallet mislabels chain 968 — LOW, external

**Symptom:** "Insufficient balance. You don't have enough **DGRAM** to cover network fees" while the wallet held 29.68 tBOT.

**Cause:** Zerion resolves chain 968 to a network whose native token is DGRAM, not BOT Chain Testnet.

**Workaround:** use MetaMask with the network added manually (968 / `https://rpc.bohr.life` / tBOT / `https://scan.bohr.life`).

**Severity:** Low, wallet-side, but it will block a demo take.

### 12.6 Demo evidence used a self-transfer — MEDIUM for demo credibility

The payment proof pasted during recording (`0xc5b9357e…`) is a transfer from `0x48997a98…` **to itself**. The verifier accepts it, but on camera a judge sees the landlord paying themselves, which undercuts the narrative. Use a second wallet as the tenant.

---

## 13. Blockers

**Blocker 1 — Vercel environment configuration. Type: permissions/access.**
Blocked: any mainnet product, and therefore the mainnet canonical claim. Why: `NEXT_PUBLIC_CHAIN_ENV` is inlined at **build** time and no Vercel CLI or token exists anywhere in the repo or `.env`. Attempted: searched `node_modules/.bin`, `.vercel/`, and `.env`; found only `.vercel/project.json` with `projectId`/`orgId`, which is not a credential. Next: the human sets the variables from `deployments/bot-mainnet/web.env` plus `ALLOW_MAINNET`, `MAINNET_VERIFIER_PRIVATE_KEY`, `MAINNET_EVIDENCE_SIGNER_ADDRESS`, and redeploys.

**Blocker 2 — No real USDT on mainnet. Type: funding.**
Blocked: the mainnet canonical claim. Every project wallet holds **0 USDT** on chain 677. Official USDT `0xaBabc7Dd…` has no public `mint()`, unlike the testnet mock. Needs roughly 0.5-1 USDT. Options: swap on `dex.botchain.ai`, bridge, or ask the organizers. **Gas is the scarcer resource** — see section 21 for the measured budget.

**Blocker 3 — Demo video. Type: human task.** Not technically blocked at all.

**Non-blocker, do not confuse:** deleting the retired ChatGPT Sites deployment. Nothing depends on it. It requires the human's OpenAI account.

---

## 14. Decisions Already Made

**LLM narrates, rules decide.** Permanent. Enforced by `evaluate.ts`. Alternatives considered and rejected: letting the model output a verdict. Reason: determinism, testability, and the entire trust story.

**Evidence must hash to the on-chain commitment.** Permanent. `serverVerifier.ts:136`.

**Canonical claim replaced rather than restored.** Permanent. See 12.2.

**Historical evidence artifacts are annotated, never rewritten.** `public-site.json` and `fresh-wallet-production.json` still contain the retired URL plus a new `siteStatus` / `urlStatus` field naming it retired. Rewriting recorded values would falsify evidence.

**Mainnet bond 0.2 BOT, stake 0.6 BOT (3x).** Provisional but baked in: the bond is a **constructor argument** to `AttestationRegistry`, so changing it requires redeployment.

**Mainnet challenge window 600s, unstake cooldown 86400s, blocked refund delay 600s.** Contract enforces window >= 300 and refund delay >= window, so testnet's 60s values cannot be reused.

**Six separate mainnet identities.** `deploy-mainnet.ts:80-82` requires >= 4 distinct among admin/guardian/resolver/verifier/treasury, and `:78` requires admin != deployer. Deployer is temporary and renounces everything at the end.

**Demo recorded on testnet.** Provisional. Reason: testnet is the only place a complete loop runs, and the slash only exists there. Mitigated by a spoken disclosure line in Scene 6.

**Two Vercel projects recommended over switching one.** Not yet executed. Reason: switching kills the working testnet demo two days before the deadline, and the mainnet site would be empty until a claim settles.

**Commit style: single-line subjects, no AI attribution.** Permanent, user preference. See section 15.

---

## 15. Things We Explicitly Do NOT Want

**No AI attribution in commits.** The user asked for this previously, was frustrated to find `Co-Authored-By: Claude` on five commits, and had them rewritten. History was rebased and force-pushed. A memory file was written at `~/.claude/projects/C--Users-HomePC-Desktop-skill-idea-research/memory/no-commit-coauthor-trailer.md`. **Never add an attribution trailer.** Match the terse single-line subject style (`fix: remove landing header report-income button`). Long multi-paragraph bodies are also off-style.

**Do not execute financial trades.** The user asked the previous agent to perform a DEX swap. It was declined as a prohibited financial transaction, and the user accepted that. Provisioning actions (paying gas, funding a role wallet, staking) were fine and were performed. **Do not offer to swap, bridge, or trade.**

**Do not ask for a Vercel token or any API key.** Explicitly avoided.

**Do not read a private key from a file path.** The user offered to put the mainnet key in a file and hand over the path. This was declined in favour of the user pasting it directly into `.env`, so the key never entered the agent's context. **Preserve that boundary.**

**Do not delete the retired ChatGPT Sites deployment on the user's behalf.** No access, and it is theirs to trigger.

**Do not restore the legacy canonical claim.** Impossible by design.

**Do not represent testnet as mainnet.** Anywhere. Disqualification risk.

**Do not add a linter now.** Deliberately deferred.

**Do not rewrite historical evidence JSON values.**

---

## 16. Work Done During This Agent Session

Chronological.

1. **Audit of the whole repo** using `Desktop/skill/audit-skill`. Found: `SUBMISSION.md` claimed 36/36 (actual 46/46) and 45 tests (actual 60), and pointed at a stale deployment. Found a partial-commit hazard where `site-nav.tsx` imported an untracked `fund-notice.tsx`.
2. **Committed `fund-notice.tsx`** together with its importer (`5f81045`).
3. **Corrected `SUBMISSION.md`** and **rewrote `README.md`** using `Desktop/skill/perfect-readme` (`8f15e36`).
4. **Documented `ALLOW_MAINNET`** in `.env.example`, a second runtime lock that was completely undocumented and would have produced a live frontend with no verifier. Removed 2.5 MB of unreferenced `og.png` / `og-v2.png` (`b6ed920`).
5. **Discovered the legacy canonical claim was unreproducible** (12.2). Wrote `scripts/canonical-claim.mjs` and produced a genuine replacement: real TestUSDT payment, live DeepSeek extraction, all eight rules PASS, attested, settled, 1,200 / 800 distributed. Repointed the audit and docs off the retired host. Fixed two stale audit assertions that were already failing before this session (`9a73387`).
6. **Annotated the retired host** in the two historical evidence artifacts (`5405c97`).
7. **Deployed to BOT Chain Mainnet** (`586ea07`). Generated six identities via new `scripts/init-mainnet-env.mjs`, measured gas with new `scripts/estimate-mainnet-gas.mjs`, ran preflight to 26/27, deployed, then independently verified bytecode and role separation from the RPC rather than trusting the script's exit code.
8. **Funded and staked the mainnet verifier**: 0.65 BOT transferred, 0.6 BOT staked at 3x bond.
9. **Made `canonical-claim.mjs` network-aware** and fixed a real bug in it: the evidence document text was hardcoded to `2000.00 USDT`, so any `CANONICAL_AMOUNT` change would have failed `AI_TERMS_MATCH` and produced a BLOCKED claim. Added a 60/40 dust guard (`a8c4fd6`).
10. **Rewrote `docs/11-demo-production-sheet.md`** as a pitch-form recording script, then merged scene staging into it as one linear read (`24def7d`, `24d9506`).
11. **Rewrote git history** to strip `Co-Authored-By` from five commits, verified all five tree hashes were byte-identical, force-pushed with `--force-with-lease`.
12. **Diagnosed the `PeriodAlreadyClaimed` revert** (12.4) by pulling the failed tx from the Blockscout API and replaying it.
13. **Built `apps/web/src/lib/contractErrors.ts`** and wired it into both failure paths (`ac537dc`). Final commit before this handover.
14. **Created `Desktop/skill/demo-video/SKILL.md`**, a reusable skill distilled from this session, and updated `Desktop/skill/README.md` to six skills. **Outside this repository.**

**Files created in this repo:** `scripts/canonical-claim.mjs`, `scripts/init-mainnet-env.mjs`, `scripts/estimate-mainnet-gas.mjs`, `apps/web/src/lib/contractErrors.ts`, `deployments/bot-testnet/canonical-claim.json`, `deployments/bot-mainnet/manifest.json`, `deployments/bot-mainnet/web.env`, `deployments/bot-mainnet/agent.env`, `HANDOVER.md`.

**Files deleted:** `apps/web/public/og.png`, `apps/web/public/og-v2.png`.

**Packages added/removed:** none.

---

## 17. Git / Working Tree State

**Branch:** `codex/testnet-build`, upstream `origin/main`. Pushes use `git push origin HEAD:main`.

**Working tree:** clean at the time of writing, other than `HANDOVER.md` itself. In sync with `origin/main`.

**Local-only branch that must not be deleted casually:** `backup-before-trailer-strip` at `b73323c`, plus `refs/original/refs/heads/codex/testnet-build`. Both preserve pre-rebase history from the trailer strip. Safe to delete once the user confirms, but **do not** remove them unprompted.

**History was force-pushed this session.** If any other clone exists, it has diverged and must reset to `origin/main`.

**Recent commits:**

```
ac537dc fix: surface decoded contract errors instead of generic reverted messages
24d9506 docs: merge scene staging into the demo script as one linear read
24def7d docs: add scene-by-scene staging to the demo sheet
a8c4fd6 docs: rewrite demo sheet as a pitch script and fix claim amount handling
586ea07 feat: deploy Veritable to BOT Chain Mainnet
5405c97 docs: mark the retired host in historical evidence artifacts
9a73387 feat: produce a real-evidence canonical claim and retire the legacy site
b6ed920 chore: document mainnet runtime lock, drop dead assets, correct report claims
8f15e36 docs: correct stale submission facts and rewrite README
5f81045 feat: surface wallet funding notice with faucet and test USDT mint
```

**Warning:** `deployments/bot-mainnet/readiness.json` is rewritten by every `pnpm preflight:mainnet` run and `deployments/bot-testnet/completion-audit.json` by every `pnpm audit:testnet`. Expect churn. Also, `pnpm build` modifies `apps/web/next-env.d.ts`; revert it rather than committing build noise.

---

## 18. Key Code Paths and Important Functions

**Claim submission**

```
app/page.tsx  handleReport()
→ AssetFactory.createAsset(assetId = keccak256(propertyName), …)
→ settlementToken.approve(vault, amount)
→ YieldVault.submitClaim(assetId, bytes32(periodKey), amount, hashCanonical(bundle))
→ account.signMessage(attestationRequestMessage(claimId, chainId, networkLabel))
→ POST /v1/process/[claimId]  { requester, signature, evidenceBundle }
```

**Hosted verification**

```
/v1/process/[claimId]/route.ts
→ verifyMessage(...)                          reject 401 if bad
→ evidenceBundleSchema.parse(body.evidenceBundle)   reject 400 if absent
→ processPublicClaim(claimId, requester, bundle, persist)
   → buildPublicVerification()
      → vault.claimForAttestation / getClaim
      → assertions at serverVerifier.ts:135-139
         period hash, evidence hash, terms hash, policy-v1
      → validatePayment()                     3 proof paths
      → evaluateClaim()                       deterministic verdict
   → persist()  = storeClaimEvidence()        RUNS BEFORE the outcome check
   → if INCONCLUSIVE  → return, no attestation
   → if already attested → return
   → sign EIP-712, AttestationRegistry.submitAttestation()
```

**Important subtlety:** the persist callback fires at `serverVerifier.ts:173`, **before** the `INCONCLUSIVE` early return at `:174` and before the attestation write. That is why, when the very first mainnet-style canonical run reverted at `submitAttestation`, the evidence bundle had already been durably stored and `/v1/reports/…` resolved anyway.

**Report resolution**

```
/v1/reports/[claimId]/route.ts
→ suppliedBundle ?? loadClaimEvidence(claimId)     Vercel Blob
→ 404 "No durable evidence record exists for this claim" when absent
→ buildPublicVerification() → report + reportHash
```

**Payment validation**, `serverVerifier.ts:67-113`, three branches:
- `source` starts `BOT_CHAIN_TX:` → `envelopeFromBotTransaction()` re-reads the transfer from chain. **No server secret required.**
- `source` starts `COUNTERPARTY_ATTESTATION:` → payer wallet signature bound to issuer, period, and document hash
- otherwise → envelope signed by `EVIDENCE_SIGNER_ADDRESS`

**Error decoding**, `contractErrors.ts`:
- `describeContractError(error)` walks a viem `BaseError` for `ContractFunctionRevertedError`, else scrapes hex from `details`, then `decodeErrorResult` against `protocolErrorsAbi`
- `explainFailedTransaction(client, hash)` replays a mined-but-failed tx via `client.call()` at its block to recover revert data
- Wired into `waitForTx()` and `safelyRun()` in `app/page.tsx`

---

## 19. Data Models / Schemas

Source of truth for shapes is `packages/schemas` (Zod). Source of truth for **state** is the chain.

**EvidenceBundle**

```ts
{
  schemaVersion: "1.0",
  periodKey: string,                    // "2026-08"
  assetTerms: {
    expectedAmountMinor: string,        // 6-decimal USDT minor units
    dueDate: string,                    // "YYYY-MM-DD"
    windowDays: number,
    amountToleranceMinor: string,
    payerReferenceHash: Hex             // keccak256(lowercased payer address)
  },
  documents: [{
    id: string,                         // "deepseek:<runId>:<filename>" triggers
                                        // extractionRequired
    contentHash: Hex,
    mediaType: string,
    kind: "LEASE" | …,
    extractedText?: string,
    extractedFacts?: { expectedAmountMinor, dueDate }
  }],
  modelRunHash: Hex,
  paymentEnvelope: {
    record: {
      status: "FOUND" | "NOT_FOUND" | "UNAVAILABLE",
      amountMinor, paidAt, payerReferenceHash,
      source, issuedAt, expiresAt, payloadHash
    },
    signer: Address,
    signature: Hex
  }
}
```

`evidenceRoot = hashCanonical(bundle)`, `termsHash = hashCanonical(bundle.assetTerms)`. Both are committed on chain. Any changed byte changes the root and is rejected.

**VerificationReport:** `reportVersion`, `claimId`, `assetId`, `periodKey`, `outcome`, `verifiedAmountMinor`, `ruleResults[{ruleId, status, message, evidenceRefs}]`, `termsHash`.

**Solidity `Claim`** (`YieldVault`): `assetId, periodKey, evidenceRoot, issuer, shareToken, escrowedAmount, verifiedAmount, snapshotId, totalShares, resolvedAt, status`. Status `2` = RELEASED.

**Attestation** (`AttestationRegistry`): a `data` tuple of 13 fields plus `verifier`, `challenger`, `counterEvidenceRoot`, `challengeDeadline`, `status`. Outcome `1` = VERIFIED, `2` = BLOCKED.

**Storage keys** in Vercel Blob: `claims/<claimId>/bundle.json`, `evidence/<owner>/<hash>/…`, `payment-requests/<requestId>.json`. All `access: "private"`.

**EIP-712 domain name:** `chainid == 968 ? "VeriFi Attestation Registry" : "Veritable Attestation Registry"`. Applied identically in `AttestationRegistry.sol:120`, `apps/agent/src/chain.ts:115`, and `serverVerifier.ts:194`. The testnet value is a legacy compatibility identifier; changing it would invalidate deployed signatures. **Verified consistent across contract and both signers.**

---

## 20. API / Integration Reference

**DeepSeek** — extraction only. `liveProviders.ts`, called from `/v1/evidence/prepare`. Auth `DEEPSEEK_API_KEY`, server-side only. Returns redacted summary, citations, expected amount, due date. Scanned or empty PDFs **fail closed**. Live in production, absent locally. It never produces a verdict.

**Vercel Blob** — private durable storage. `evidenceStorage.ts`. Auth `BLOB_READ_WRITE_TOKEN`. If unset, `storageToken()` throws and the route returns 500; a missing record returns 404. Live in production, absent locally.

**BOT Chain RPC** — `viem` HTTP transports. Testnet `https://rpc.bohr.life`, mainnet `https://rpc.botchain.ai`. Mainnet gas price observed at **20 gwei**.

**Blockscout explorer API** — not used by the product, but useful for debugging. Both `https://scan.bohr.life/api?module=account&action=txlist&address=…` and `/api/v2/addresses/<addr>/transactions` work and return `result: "execution reverted"` plus `raw_input`. This is how 12.4 was diagnosed.

**Wallet** — `injected()` only. MetaMask verified working. **Zerion mislabels chain 968**, see 12.5.

---

## 21. Blockchain / Smart Contract State

### Testnet, chain 968, deployment block 19536921

```
settlementToken       0x38fbbd141c1e31d1058bbd15bbcb7b37233802db   mock, mintable
assetRegistry         0xa5728e7aab1373d2af4b39d58ee1010167123560
assetFactory          0xe47eb79160f4594891df5caf8335580b97b30369
revenueShareToken     0x67cd42e7017ad134c00a04dcf005fb5cedb9b988
verifierStaking       0x17e8bcb0940e656abeef09e7610ec6c623ec8f39
yieldVault            0x6786d682738d2f0e1d31c113de9aece14ac43f1a
attestationRegistry   0x5e18d2c62257bceddcc21e0a0fd2dd9d6ed79a37
marketplace           0xda709994fa8e4bfcc550e8c6504b9017590fa318
```

Parameters: verifier bond 2 BOT, challenger bond 0.25 BOT, challenge window 60s, unstake cooldown 300s, blocked refund delay 60s.

**Canonical claim (current):** `0x1b547def2d1d6be5c508e357650fdd7366bd21b1b44ceb11c4e503b6d7a69c1a`
- VERIFIED, all eight rules PASS, 2,000 USDT, distributed 1,200 / 800 on a 60/40 snapshot
- Model run `225f8070-c374-4289-80ad-705b0ee40f2d`
- Income payment `0x559cb6f46a80411165bb3cfc2d61bd666b4121d6879a4a773c54819bf5a5eced`
- Attestation `0x3512484dc5615a98147a9403d6ad520ea3e7ada8ae0b863c77cc324d68598224`
- Settlement `0x8b79c17993c6b7db401bd2275934134b5eebb2e2bd1217fd058a0e46e1afb96d`
- Report: `POST https://veritable-web-sigma.vercel.app/v1/reports/0x1b547def…`

**Slash evidence (the demo climax):**
- Challenge `0x275cf40d0ffba0a2ee6bfd5a1e489276516bdcb5f1c14ddc66136e14bd77d73a`
- Overturn and slash, 5 → 3 tBOT `0x82318cab75659f149e73b575848befc7c65ff2954a3ac67f0b966d7b699afb56`
- Refund, 1,500 USDT verified on chain `0x32f1a7afffacd1b55ad67bfe1c67f5f57af6f170422cf5b9d4917514f33264b1`

**Orphan:** claim `0x0133524b476896ed44b1a00b70b05993514e372bad4496c3b4f9491b6bfc9a6e` from the first canonical-claim run holds 2,000 escrowed TestUSDT and was never attested (that run reverted on `InsufficientFreeStake`). Harmless.

### Mainnet, chain 677, deployment block 20300480

```
settlementToken       0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C   OFFICIAL USDT
assetRegistry         0xfc9dbf0a8468aa56799b4e23b1ebe936426ee30b
assetFactory          0xdd3366c1aecec5f439f58d824f446c794d54b089
marketplace           0xf2d77abff2d699f370a83a067b643642a4f5ee77
verifierStaking       0xafa7bd24051a4336da9560c7929a3d103c52bcb2
yieldVault            0x97205b095ac6ebe0e932a9a36e5955b92b165ca1
attestationRegistry   0x8dea0de1e273d3b2f8a221f96ba464c27af23240
```

Roles (public addresses):

```
deployer   0xCc67779F8eDb2C80DC665775C5597657C512FE1A   temporary, renounced all
admin      0x3A3DFC22820d1B0d6d0aD4D7438720c0D3d4dD07
guardian   0x53040E561033b1cDA5D4BF0567991a6D3B915922
resolver   0x585AEc1C5FE1d044986B74FcD36F1ea55c506E52
verifier   0x2EDc775221FE928c252bc570FEcfd6E1a1F135AC
treasury   0xBbE9aCeCbD279E71D965bF80efB9E06755bd4757
evidence   0xC4FA047E326eAC1911Cb63576555EcD30aDA746a
```

**Verified independently from the RPC after deployment:**

```
                       deployer   admin
assetRegistry          false      true
verifierStaking        false      true
yieldVault             false      true
attestationRegistry    false      true

VERIFIER_ROLE → verifier   true
RESOLVER_ROLE → resolver   true
GUARDIAN_ROLE → guardian   true (vault and registry)
```

**Balances at handover:** deployer ~0.1499 BOT, verifier ~0.0491 BOT gas plus **0.6 BOT staked** against a 0.2 bond. **0 USDT everywhere.**

**Measured costs.** Deployment actually spent **0.19971 BOT** against a 0.20477 estimate. A full claim flow costs **2,890,795 gas ≈ 0.0578 BOT** at 20 gwei, dominated by `createAsset` at 1,651,770 because the factory deploys a token contract. **If you swap BOT for USDT, swap at most 0.07 BOT** or the claim run will die partway.

**Stake capacity.** 0.6 BOT free stake against a 0.2 bond allows **three concurrent unsettled attestations**. The fourth reverts `InsufficientFreeStake(available, required)`. This is a real throughput ceiling and it caused a real failure on testnet.

---

## 22. AI / Agent Logic

**Model:** DeepSeek, default `deepseek-v4-pro`, configurable via `DEEPSEEK_MODEL`.

**Where:** `apps/web/src/lib/liveProviders.ts`, invoked only by `/v1/evidence/prepare`.

**What it does:** reads bounded text extracted from the uploaded document and returns a redacted summary, citations, an expected amount, and a due date.

**What it does NOT do:** decide anything. Its output becomes `documents[].extractedFacts`, which two rules then check:

- `AI_EXTRACTION_PRESENT` — PASS if structured facts exist, else UNKNOWN
- `AI_TERMS_MATCH` — PASS only if extracted `expectedAmountMinor` **and** `dueDate` both equal the registered `assetTerms`

`extractionRequired` is derived at `serverVerifier.ts:151` from whether any document id starts with `"deepseek:"`. Six rules run without it, eight with it.

**Guardrails:** any UNKNOWN forces INCONCLUSIVE; any FAIL forces BLOCKED; `verifiedAmountMinor` is `"0"` unless VERIFIED. Scanned or empty PDFs fail closed. The user must tick a consent checkbox before text is sent.

**Cost:** one extraction call per prepared claim. Negligible at demo volume.

**Trap for the next agent:** any script that writes the evidence document must state the **same amount** the terms register. This was a real bug in `canonical-claim.mjs`, where the document text was hardcoded to `2000.00 USDT`; running with `CANONICAL_AMOUNT=0.5` would have failed `AI_TERMS_MATCH` and burned real gas producing a BLOCKED claim. Fixed by deriving `AMOUNT_DECIMAL` from `AMOUNT`.

---

## 23. UI / UX State

**Pages:** `/`, `/app`, `/marketplace`, `/attest/[requestId]`.

**Landing headings, deliberately chosen and used as the demo's narrative spine:** "Bring the proof", "Make truth contestable", "Release verified yield".

**`/app`:** header "Prove the yield, then get paid." Jobs **Report** and **Track**, plus **Connect** and **Download sample**. A `FundNotice` in the site nav warns on low gas or low TestUSDT with a faucet link and a one-click mint (testnet only).

**Design decisions the user made explicitly:**
- **No long dashes in product UI.** Commit `552015e` removed them. Honour this in any user-facing copy.
- Terse, plain copy. "income", not "rent".
- The protocol console was replaced with the Report / Track / Invest job framing.

**Known UI gaps:**
- `/marketplace` server-renders "No listings yet" before client hydration. Cosmetic, but it will ruin a demo take.
- Report inspection depends on durable storage, so a claim is only viewable on the deployment holding its bundle. Not signposted in the UI.
- Error surfacing was generic (`"Yield claim reverted"`) until `contractErrors.ts` landed in `ac537dc`. **The improvement is committed but has not been observed in a browser.**

---

## 24. Testing Status

**60 automated tests, all passing.**

```
packages/policy      14   rule engine
packages/config       3
apps/agent           11   processor + verify
apps/api              4   payment oracle + public reports
apps/web              9   evidenceAuthorization, format, paymentProofs
packages/contracts   19   protocol state transitions (Hardhat/Mocha)
packages/doctor       0   NO TESTS. Runs with --passWithNoTests.
```

The contract suite covers replay rejection, wrong policy hash, terms mismatch, partial VERIFIED rejection, settlement before window close, challenge exactly at deadline, double withdrawal, stake withdrawal while bonded, and pause behaviour.

**Live verification:** `pnpm audit:testnet` → **46/46**, written to `deployments/bot-testnet/completion-audit.json`.

**Manual testing performed this session:** full canonical claim end to end on testnet including live DeepSeek and real payment proof; mainnet deployment with independent bytecode and role verification; mainnet verifier funding and staking; explorer link checks.

**Not tested:** `contractErrors.ts` in a browser. `apps/agent` end to end. Anything on mainnet beyond deployment and staking.

---

## 25. Build / Typecheck / Lint Status

Run immediately before this handover, at `ac537dc`:

```text
pnpm test                        → PASS (exit 0, 60 tests)
pnpm typecheck                   → PASS (exit 0, all workspaces)
pnpm build                       → PASS (exit 0)
pnpm audit --prod --audit-level high → PASS, no known vulnerabilities
pnpm audit:testnet               → PASS, 46/46
pnpm preflight:mainnet           → 26 of 27 (only the deployment
                                   authorization switch is "not granted",
                                   which is correct post-deployment)
lint                             → NO LINT COMMAND EXISTS
```

**CI** (`.github/workflows/ci.yml`) runs, on every push and PR: pinned install, `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm audit --prod --audit-level high`, on the Node version in `.nvmrc`.

---

## 26. Deployment Status

**Frontend:** Vercel project `veritable-web` (`.vercel/project.json`), live at https://veritable-web-sigma.vercel.app, configured for **BOT Chain Testnet**. Pushing to `main` triggers redeploy.

**Retired:** a ChatGPT Sites deployment at `verifi-bot-chain.cheery-bowl-9509.chatgpt.site`, built via `pnpm --filter @veritable/web build:sites` (`vinext build`) and uploaded manually. It is **still publicly reachable (HTTP 200)** and serves an older commit. Nothing in the repo depends on it. It holds the only copy of the legacy canonical claim's evidence bundle, which is unreproducible anyway. The user intends to delete it; only they can.

**Contracts:** testnet and mainnet both deployed, see section 21.

**Mainnet frontend:** does not exist. This is Blocker 1.

---

## 27. Hardcoded / Mocked / Temporary Parts

- **`assetId = keccak256(propertyName)`** (`app/page.tsx:364`). Property names are effectively globally unique keys. Reusing a name collides with an existing asset.
- **`policyHash = keccak256("policy-v1")`** hardcoded in `serverVerifier.ts:138` and every script. Assets not registered under `policy-v1` are rejected.
- **Testnet settlement token is a mock with a public `mint()`.** Mainnet uses official USDT which cannot be minted. Any script assuming `mint()` breaks on mainnet; `canonical-claim.mjs` now guards this.
- **`apps/api/src/evidenceFixtures.ts`** contains four labelled fixture evidence roots from the older design. Not on the live path, retained for compatibility.
- **`canonical-claim.mjs` generates a throwaway issuer wallet** whose key is written to the gitignored `.verifi/last-prepared-bundle.json`. On testnet, 60% of the distributed amount lands in that disposable wallet. Deliberate: a brand new wallet issuing an asset proves the system is permissionless.
- **Demo document text** in `canonical-claim.mjs` is a synthetic lease statement. Real, in that DeepSeek genuinely extracts from it, but authored by the script.
- **Two tracked `.env` files** under `deployments/bot-testnet/` contain deployment outputs only. Verified: no private keys.
- **`.release/*.tar.gz`** is about 19 MB of stale site build tarballs, gitignored, local only. Safe to delete.

---

## 28. Technical Debt

| Item | Location | Risk | Fix before submission? |
|---|---|---|---|
| No linter or formatter | repo-wide | Style drift; small ding on Technical Quality | No |
| `doctor` has zero tests but is in `pnpm test` | `packages/doctor` | Implies coverage that does not exist | No |
| `fresh-wallet-production.mjs` is broken | `apps/web/scripts/` | Wastes a future agent's time | Delete or rewrite |
| ~8 unused vars in `.env.example` | `.env.example` | Confusion | No |
| Hand-written ABIs with no error entries | `apps/web/src/lib/abis.ts` | Errors decode only via `protocolErrorsAbi`; the two lists can drift | Later |
| Single verifier, single resolver | contracts + ops | Centralisation; disclosed | No |
| `evidenceFixtures.ts` legacy roots | `apps/api/src/` | Dead concept still in tree | Later |

---

## 29. Things That Are Fragile

- **`hashCanonical` coupling.** The bundle hash is committed on chain. Any change to canonical serialisation, field order, or schema silently invalidates every existing claim. **Do not touch `packages/policy` canonicalisation.**
- **The EIP-712 domain switch.** `chainid == 968 ? legacy : new`, replicated in three places. Change one and signatures break.
- **`extractionRequired` depends on a document id prefix** (`"deepseek:"`). A rename to the id format silently changes rule count from eight to six.
- **`protocolErrorsAbi` is hand-maintained.** Adding a Solidity error without adding it there produces `The contract rejected this with <name>` or no decode at all.
- **Build-time network selection.** `NEXT_PUBLIC_CHAIN_ENV` is inlined at build. Changing it requires a redeploy, not a restart.
- **Verifier stake capacity.** Three concurrent bonds at current settings. Silent, late-stage failure mode.
- **`pnpm test` requires `pnpm` on PATH** because it spawns nested `pnpm` per workspace. `corepack pnpm test` fails partway through.
- **`pnpm build` mutates `apps/web/next-env.d.ts`.**
- **The audit script hardcodes the canonical claim ID** (`scripts/audit-testnet-completion.ts:8`) and expects exactly 8 rules. Producing a new canonical claim means updating both.
- **The audit hardcodes UI copy strings** for the marketplace check. Two of these were already stale and silently failing before this session.

---

## 30. Important Context That Exists Only in Conversation

- **The user's priority order, stated explicitly:** record the demo video first, because it is unblocked and time-consuming. Mainnet product second. Everything else third.
- **The user is recording the demo right now.** They hit the `PeriodAlreadyClaimed` revert mid-recording. They need a working take more than they need new features.
- **Deadline pressure is real:** submission closes 2026-08-22 23:59 UTC+8. Do not start refactors.
- **The user asked whether outside users can use the product.** Answer, verified in the contracts: yes. `createAsset`, `buy`, and `challenge` all lack role gates. Only `resolve` and `pause` are gated. The real limit is verifier stake capacity, not permissions.
- **The user chose to keep a fresh disposable issuer** in the canonical claim rather than routing all funds to wallets they control, specifically because it demonstrates the system is open.
- **The user asked me to swap BOT for USDT and I declined.** They accepted. Do not re-offer.
- **The user was frustrated by AI attribution in commits.** This is the single most likely way to annoy them. See section 15.
- **The user found the tab lettering (E, F, G, H, I) in the demo script confusing**, and separately asked for scene staging to be merged into the script rather than kept in its own section. Both were addressed. The underlying lesson: they want one linear document, with complete pasteable URLs, and explicit labels when context switches between systems.
- **Submit early, then improve.** The user's own `project-edge` skill says a submitted draft beats a polished miss. `SUBMISSION.md` still has one placeholder blocking submission.
- **Recommendation the user has not yet acted on:** create a **second** Vercel project for mainnet instead of switching the existing one, so the working testnet demo survives until the deadline.

---

## 31. Failed Attempts and Dead Ends

```text
Attempt: Run `pnpm test` via the Bash tool.
Reason:  Standard verification.
Happened: "pnpm: command not found", but piping to `tail` made the shell
          report exit code 0, which looked like a pass.
Why failed: pnpm is not on PATH; the pipe masked the failure.
Learned: Never trust an exit code through a pipe. A corepack shim directory
         prepended to PATH is required because `pnpm test` spawns nested pnpm.
Retry?  No. Use the shim.
```

```text
Attempt: Restore the legacy canonical claim on the current deployment.
Reason:  So /v1/reports/0xd4cf42… would resolve and the site could be retired.
Happened: Impossible.
Why failed: Its on-chain evidenceRoot is keccak256("evidence:exact-payment"),
         a label hash. serverVerifier requires hashCanonical(bundle) to equal
         it, and no object hashes to a string literal.
Learned: It is an artifact of an older server-generated-evidence design.
Retry?  No. It was replaced by 0x1b547def….
```

```text
Attempt: First real-evidence canonical claim run.
Reason:  Produce a durable canonical report.
Happened: Everything succeeded through VERIFIED, then submitAttestation
         reverted 0x802f3a42 = InsufficientFreeStake(1 BOT, 2 BOT).
Why failed: The verifier's free stake had been drawn down by earlier bonds
         after the 5→3 slash.
Learned: Budget verifier stake at 2-3x the bond. Also: the evidence bundle was
         persisted anyway because the persist callback runs before the
         attestation write.
Retry?  Already retried successfully after adding an automatic stake top-up.
```

```text
Attempt: `import { hashCanonical } from "@veritable/policy"` in a root script.
Happened: ERR_MODULE_NOT_FOUND.
Why failed: Workspace deps are linked per-package, not at the root.
Learned: Root scripts must import "../packages/policy/dist/index.js", as
         scripts/sign-evidence.ts already did.
Retry?  No.
```

```text
Attempt: Decode hasRole with viem's decodeFunctionResult in a one-liner.
Happened: Returned undefined for every call.
Why failed: Misused the return shape.
Learned: For quick RPC checks, build calldata by hand and compare
         BigInt(result) === 1n.
Retry?  Only with correct decoding.
```

```text
Attempt: Scan the production JS bundle for baked-in NEXT_PUBLIC_ addresses.
Reason:  Verify whether assetFactory and marketplace reached production.
Happened: Chunk extraction returned nothing usable.
Why failed: Next.js chunk loading did not match the naive grep.
Learned: 12.3 remains NEEDS VERIFICATION. Check the Vercel dashboard,
         including the Shared tab, instead.
Retry?  Only via the dashboard.
```

---

## 32. Open Questions / Uncertainties

```text
CONFIRMED
- Mainnet contracts deployed, bytecode present, roles separated. Verified via RPC.
- Verifier holds 0.6 BOT free stake against a 0.2 bond.
- 60 tests, 46/46 live audit, typecheck, build, prod audit all pass at ac537dc.
- Canonical claim 0x1b547def… is VERIFIED on eight rules with durable storage.
- All project wallets hold 0 USDT on mainnet.
- The retired ChatGPT Sites deployment still returns HTTP 200.
- createAsset, buy, and challenge are permissionless in the contracts.

LIKELY
- The Vercel variable list the user pasted was filtered or truncated, because
  DEEPSEEK_API_KEY and BLOB_READ_WRITE_TOKEN were absent yet provably work.
- Zerion has a chain-968 mapping collision with a network whose token is DGRAM.

UNKNOWN
- Whether NEXT_PUBLIC_ASSET_FACTORY_ADDRESS is genuinely Preview-only in
  production, and whether NEXT_PUBLIC_MARKETPLACE_ADDRESS is set at all.
- Whether apps/agent works end to end against a live deployment.
- Whether the user has shared the retired URL anywhere external.

NEEDS VERIFICATION
- contractErrors.ts behaviour in a real browser. It typechecks, builds, and the
  suite passes, but no human has seen a decoded message on screen.
- Whether the marketplace currently renders a real offering card client-side.
  The chain has 2 live listings; the SSR placeholder says "No listings yet".
```

---

## 33. Recommended Next Steps

### Immediate

1. **Unblock the demo recording.** Tell the operator to use a **new property name** (assetId is `keccak256(propertyName)`) and **MetaMask, not Zerion**. Confirm `/marketplace` shows a real card before recording.
2. **Record the video** from `docs/11-demo-production-sheet.md`. Seven scenes, 388 words, about 2:50.
3. **Fill `[PUBLIC_DEMO_VIDEO_URL]` in `SUBMISSION.md:23` and submit.** It is the only remaining placeholder.

### After that

4. **Vercel mainnet project.** Recommend a second project rather than switching `veritable-web`. Values are in `deployments/bot-mainnet/web.env` plus `ALLOW_MAINNET=true`, `MAINNET_VERIFIER_PRIVATE_KEY`, `MAINNET_EVIDENCE_SIGNER_ADDRESS`, and the shared `DEEPSEEK_API_KEY` / `BLOB_READ_WRITE_TOKEN`.
5. **Acquire 0.5-1 USDT on chain 677.** Warn: swap at most 0.07 BOT, gas needs 0.0578.
6. **Run the mainnet canonical claim:**
   `CHAIN_ENV=bot-mainnet CANONICAL_AMOUNT=0.5 HOSTED_TEST_BASE_URL=<mainnet-url> pnpm canonical:testnet`
7. **Re-shoot Scene 6** with a real mainnet settlement and drop the testnet disclaimer for that scene only.
8. **Update `SUBMISSION.md`** with the mainnet claim.

### Before demo / submission

9. Verify the Vercel scoping anomalies in 12.3.
10. Re-run `pnpm audit:testnet` and confirm 46/46 after any change.
11. Confirm `contractErrors.ts` shows a readable message in a browser.

### Nice to have

12. Delete or rewrite `fresh-wallet-production.mjs`.
13. Add ESLint and a `lint` script.
14. Give `packages/doctor` real tests.
15. Prune unused `.env.example` entries.
16. Delete `.release/*.tar.gz` locally (~19 MB).

---

## 34. START HERE — NEXT AGENT

```text
You are taking over Veritable, a BOT Chain AI x RWA hackathon submission that
is TWO DAYS from its deadline (2026-08-22, 23:59 UTC+8).

Do NOT begin by refactoring, adding a linter, or reorganising anything.
The build is green and the tree is clean. Keep it that way.

FIRST, in this order:
1. Read this file completely, then README.md and SUBMISSION.md.
2. Run:  git status && git log --oneline -5
   Expect a clean tree at ac537dc on branch codex/testnet-build (upstream main).
3. Set up pnpm. It is NOT on PATH. Create a corepack shim directory and
   prepend it, or every nested workspace command will fail:
     corepack enable --install-directory <dir>
     PATH=<dir>:$PATH
4. Verify:  pnpm test  (expect 60 passing)  and  pnpm typecheck.
5. Read docs/11-demo-production-sheet.md. That is the active work item.

THE CURRENT HIGHEST-PRIORITY PROBLEM
The user is recording a demo video and hit a revert mid-take. It is NOT a bug:
YieldVault rejects a second income claim for the same asset and period
(PeriodAlreadyClaimed). assetId = keccak256(propertyName), so the fix is to use
a NEW PROPERTY NAME. Also tell them to use MetaMask, because Zerion mislabels
chain 968 and reports a DGRAM balance.

WHAT SUCCESS LOOKS LIKE RIGHT NOW
A recorded ~2:50 video following the seven scenes in the production sheet, its
URL pasted into SUBMISSION.md:23, and the submission filed. Everything else is
score, not eligibility. Eligibility is already secured: mainnet contracts are
live on chain 677 at block 20300480 with verified role separation.

THE TWO REAL BLOCKERS, both needing the human, neither needing code
1. Vercel environment configuration for a mainnet frontend. There is no Vercel
   token in this repo and you must not ask for one.
2. Real USDT on chain 677. Every wallet holds zero. Official USDT has no mint().

RULES THAT WILL GET YOU IN TROUBLE IF YOU IGNORE THEM
- Never add Co-Authored-By or any AI attribution to a commit. Use single-line
  subjects matching the existing history.
- Never execute a swap, bridge, or trade. Paying gas and funding role wallets
  is fine; trading is not.
- Never let a model produce a verdict. The LLM extracts; deterministic rules in
  packages/policy/src/evaluate.ts decide. That is the whole product.
- Never represent testnet as mainnet in any material.
- Do not touch hashCanonical or the EIP-712 domain switch.

IF YOU NEED TO PROVE SOMETHING WORKS
  pnpm audit:testnet        46 live checks against the deployed chain
  pnpm preflight:mainnet    27 read-only mainnet checks, no broadcast
```

---

## 35. Definition of Done

- [x] Contracts deployed to BOT Chain Mainnet with verified role separation
- [x] Bonded verifier funded and staked above its bond on mainnet
- [x] Complete user loop working end to end on a public URL
- [x] A real-evidence canonical claim, VERIFIED, settled, distributed
- [x] Adversarial path proven on chain: challenge, overturn, slash, refund
- [x] 60 tests, typecheck, build, and production dependency audit all passing
- [x] README and SUBMISSION claims all backed by a command, test, or transaction
- [x] Public GitHub repository
- [ ] Demo video recorded and its URL in `SUBMISSION.md`
- [ ] Submission actually filed before 2026-08-22 23:59 UTC+8
- [ ] Public frontend serving BOT Chain Mainnet
- [ ] At least one income claim settled on mainnet
- [ ] Retired ChatGPT Sites deployment taken down

The first eight are done. **The ninth and tenth decide whether any of it counts.**

---

## Handover Confidence

**Fully Verified** — directly confirmed from code, config, RPC, or a command run during this session:
mainnet and testnet contract addresses and bytecode; mainnet role separation; verifier stake; all wallet balances quoted; 60 tests / 46 checks / typecheck / build / prod audit results; the eight rule IDs and outcome derivation; permissionlessness of `createAsset`, `buy`, `challenge`; the `PeriodAlreadyClaimed` diagnosis via replay; the EIP-712 domain switch consistency; every explorer link cited; git branch, history, and clean tree.

**Partially Verified** — strong evidence, not fully exercised:
`contractErrors.ts` (typechecks, builds, suite passes; never seen in a browser); `apps/agent` (tests pass; not run end to end); the `fresh-wallet-production.mjs` breakage (proven by reading the route contract and the hash requirement, not by running it).

**Session-Derived Context** — from conversation, not recoverable from the repository:
the commit-attribution preference and the history rewrite; the declined swap; the private-key handling boundary; the two-Vercel-projects recommendation; the demo priority ordering; the decision to keep a disposable issuer; the user's dislike of long dashes in product UI; the reasoning behind replacing rather than restoring the canonical claim.

**Unknown / Could Not Verify:**
the true Vercel variable scoping in 12.3; whether the marketplace renders listings client-side right now; whether the retired URL was shared externally; DeepSeek's exact prompt text (in `liveProviders.ts`, not read line by line this session).

**Potentially Missing Context:**
anything in `docs/00` through `docs/10` that predates this session and was not re-read; the exact contents of the Vercel dashboard including the Shared tab; any organiser communication in the BOT Chain Telegram; whatever the user did locally between messages, including faucet claims (the testnet wallet balance rose from 19.68 to 29.68 tBOT unprompted).
