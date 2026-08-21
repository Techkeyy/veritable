# Veritable UX rebuild plan

> Historical implementation plan: this document governed the Testnet UX rebuild and no longer describes release scope or current deployment status. See [README.md](README.md) and [SUBMISSION.md](SUBMISSION.md) for the live Mainnet product.

Status: **executed and archived**
Read this before editing product UI. Do not invent extra phases, Mainnet work, or new protocol features while executing this file.

## Product rule

The idea is **proof of income before distribution**. Tokenization is plumbing. Users should report rent, see a verdict, and get paid. They should not operate a 9-tab contract console.

The contracts, policy engine, DeepSeek extraction, attestation, challenge, slash, and marketplace settlement **do not change** unless a UI path is otherwise impossible. If a UI change would require a Solidity change, stop and say so.

## Out of scope

- BOT Mainnet deployment
- Demo video
- New planning docs besides this file
- Rewriting the verifier, policy, or evidence schemas
- Decentralized dispute resolution
- Bank / Plaid / KYC
- Multi-holder issuance in the first path
- Bringing back the long console as the default UI

## Jobs the product has

| Job | Who | Route |
|---|---|---|
| Report this month’s rent | Issuer | `/app` |
| See the verdict and act on it | Anyone | `/app?mode=track` |
| Buy shares | Investor | `/marketplace` |
| Confirm a payer signature | Payer | `/attest/[requestId]` (keep, do not redesign unless broken) |

Stake, list shares, challenge, and finalize are **not** top-level jobs. They appear from the tracker, or under Advanced.

---

## Phase 0 — Guardrails and helpers

Do this first so later phases do not grow a mess of copy-paste.

- Add small web helpers only:
  - `apps/web/src/lib/format.ts` — human amounts, share amounts, period labels, rule copy, sample lease text
  - `apps/web/src/lib/session.ts` — remember last property, period, claim, attestation, evidence bundle
  - `apps/web/src/components/site-nav.tsx` — **Invest / Report rent / Track a claim** + wallet
- Add `transfer` to the client ERC-20 ABI so a one-click test payment can send TestUSDT.
- Add `termsHashOf` to the client registry ABI so a second report on an existing property can confirm terms still match.
- Persist enough session state that a refresh does not force the user to paste bytes32 or JSON.
- Kill the words “protocol console” in product nav and empty states.

Done when: helpers exist, no user-facing flow has changed yet, existing tests still typecheck.

---

## Phase 1 — One-screen issuer path

Replace `/app` issuer UI with a single form: **Report this month’s rent.**

Visible fields:

- Property name
- Period (default: current UTC month)
- Amount (default: `2000`)
- Due date (default: 1st of that period)
- Window / tolerance stay at 5 days / 0 unless Advanced is opened
- Lease upload (PDF or text)
- Payment proof
- Consent checkbox

Payment proof, in this order:

1. **Send a test payment** — mint TestUSDT if needed, transfer the claimed amount so a real Testnet tx exists, store that hash
2. Or paste an existing BOT TestUSDT tx hash
3. Or use the existing payer-signature link (secondary)

Also ship a **sample lease download** so the path is completable without a real document.

On submit, one button runs the existing protocol sequence in order:

1. Prepare live evidence (DeepSeek + independent payment check)
2. If this property is new: `createAsset` with derived name/symbol/id, `policy-v1`, committed terms, **100 shares to the connected wallet**
3. If it already exists: reuse it only when on-chain terms hash matches this bundle
4. Approve TestUSDT, `submitClaim`, authorize hosted verification
5. Save session and go to the tracker with the report open

UI rules:

- Never show the evidence JSON textarea
- Never ask the user to paste an asset ID or claim ID on this path
- Before wallet prompts, show a short list: approve USDT → submit claim → authorize verification
- Setup strip at the top: connect, switch to BOT Testnet, get tBOT (faucet link), get TestUSDT

Copy rule: the issuer **declares** the rent; DeepSeek **extracts the document separately**; a mismatch fails. Do not imply the model invents the terms.

Done when: a connected Testnet wallet can go from empty form to an attested claim without visiting another tab, and without pasting hashes.

---

## Phase 2 — Claim tracker

`/app?mode=track` is the second surface. It is also the landing place after a successful report.

Must show:

- Property name + period, not a raw claim ID
- One-sentence outcome (`VERIFIED` / `BLOCKED` / `INCONCLUSIVE` translated)
- Human rule rows (“Paid on time”, not `DATE_IN_WINDOW`)
- Challenge-window countdown when an attestation is pending
- State-based actions only:
  - window open → Challenge
  - window closed, unchallenged → Finalize
  - released → Claim your share
- Collapsed **Proofs**: claim id, attestation id, report hash, explorer links
- Optional: load another claim by ID
- Auto-load the last session claim

Optional on this page, collapsed, not in the first viewport:

- **Offer shares** — list some of the issuer’s inventory on the marketplace
- **Advanced** — stake as verifier

Challenge and finalize stay the current contract calls. Resolver overturn stays resolver-only and stays inside Advanced, labeled as admin.

Done when: after reporting rent, a user can understand the verdict and take the next money action without opening a sidebar of protocol tabs.

---

## Phase 3 — Marketplace as the investor job

`/marketplace` is only for buying and seeing what you own.

- Shared site nav (Invest current)
- Default buy quantity, live cost (“3 shares · 30 TestUSDT”)
- Human share / USDT formatting (no 18-decimal dust)
- After buy: “You own X. When this property reports verified rent, claim it from Track a claim.”
- Portfolio links to `/app?mode=track`
- Empty state: “No listings yet. Report rent / offer shares” — never “open the protocol console”
- Keep TestUSDT faucet and network switch

Do not add issuer forms to this page.

Done when: an investor can connect, mint TestUSDT, buy a listed offering, and know where yield is claimed.

---

## Phase 4 — Landing and leftover copy

Keep the cinematic landing. Change destinations and verbs only.

- Nav: **Report this month’s rent** → `/app` (not “Launch app” into a console)
- Primary: **Explore properties** → `/marketplace`
- Secondary: **Report this month’s rent** → `/app`
- Role card “Public” → `/app?mode=track`
- Footer “Protocol” → “Report rent”
- Short try-it line, first-path only: upload or sample lease → send test payment → wait the window → claim
- Do not add architecture sections

Light CSS only for: product nav, one-screen form, tracker report, countdown, signing preview, collapsed proofs, marketplace cost line.

Done when: every public link lands in a job, not `#console`.

---

## Phase 5 — Check the path, then stop

- Typecheck / existing web tests still pass
- The old 9-tab console is gone from the default UI
- Happy path does not require JSON or bytes32
- Marketplace and tracker still use the live Testnet contracts
- No Mainnet unlock, no new docs, no contract rewrite
- If a leftover Advanced path is needed for the existing adversarial slash demo, keep it one collapsed block on the tracker — do not rebuild the console

Stop. Do not start a sixth phase.

---

## Implementation order

0 → 1 → 2 → 3 → 4 → 5

Do not restyle the landing before the issuer path works. Do not add marketplace features before Track can receive a claim. Do not “improve” DeepSeek, policy, or Solidity while this file is open.

## Files expected to change

- `apps/web/src/app/app/page.tsx` — replace console with report + tracker
- `apps/web/src/app/marketplace/page.tsx` — investor-only polish
- `apps/web/src/app/page.tsx` — landing CTAs
- `apps/web/src/app/globals.css` — product-surface styles
- `apps/web/src/lib/abis.ts` — `transfer`, `termsHashOf`
- new: `apps/web/src/lib/format.ts`, `apps/web/src/lib/session.ts`, `apps/web/src/components/site-nav.tsx`

Files not expected to change: `packages/contracts/**`, `packages/policy/**`, `apps/agent/**`, `docs/**`, `SUBMISSION.md`, Mainnet scripts.
