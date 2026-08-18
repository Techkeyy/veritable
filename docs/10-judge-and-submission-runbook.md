# Judge runbook and submission draft

## Release truth table

| Gate | Evidence | Status |
|---|---|---|
| Complete BOT Testnet contracts | `deployments/bot-testnet/manifest.json` | Passed |
| Release and 60/40 holder withdrawal | `deployments/bot-testnet/acceptance.json` | Passed |
| False approval challenge, slash, and refund | `deployments/bot-testnet/acceptance.json` | Passed |
| Hosted verifier attestation and idempotency | `deployments/bot-testnet/public-demo.json` | Passed |
| Native and Cloudflare-compatible production builds | build output plus CI | Passed locally |
| Public website | https://veritable-web-sigma.vercel.app | Passed |
| Reviewable source repository | Private Sites source is pushed; judging repository URL/access still required | Partial |
| Fresh external wallet stranger test | `deployments/bot-testnet/fresh-wallet-production.json` | Passed |
| BOT Mainnet deployment | Deferred by user | Out of current build scope |
| Mainnet read-only preflight | `deployments/bot-mainnet/readiness.json` | Technical checks passed; authorization/identities/parameters pending |

The Veritable Testnet product is complete. Hackathon submission eligibility is a separate publication/migration concern: the supplied challenge rules require BOT Mainnet, a public product, wallet interaction, a complete business loop, and a reviewable source repository. Mainnet is explicitly deferred and must not be claimed as deployed.

## Fast judge path

### Read-only proof in under one minute

1. Open the deployed site and choose **Inspect report**.
2. The canonical claim ID is `0x1b547def2d1d6be5c508e357650fdd7366bd21b1b44ceb11c4e503b6d7a69c1a`.
3. Load the report and inspect eight deterministic rules, the full claim ID, attestation ID, and report hash. Two of those rules cover the live DeepSeek extraction; the remaining six cover the onchain payment proof.
4. Verify the attestation transaction on BOTScan: https://scan.bohr.life/tx/0x3512484dc5615a98147a9403d6ad520ea3e7ada8ae0b863c77cc324d68598224
5. Verify permissionless settlement: https://scan.bohr.life/tx/0x8b79c17993c6b7db401bd2275934134b5eebb2e2bd1217fd058a0e46e1afb96d
6. Verify the underlying income payment the report reconciles against: https://scan.bohr.life/tx/0x559cb6f46a80411165bb3cfc2d61bd666b4121d6879a4a773c54819bf5a5eced

### Fresh-wallet path

Network parameters:

- Network: BOT Chain Testnet
- Chain ID: `968`
- RPC: `https://rpc.bohr.life`
- Explorer: `https://scan.bohr.life`
- Faucet: https://faucet.botchain.ai/basic/

Steps:

1. Fund a fresh wallet with testnet BOT and connect it to the site.
2. Choose **Create asset**. The asset ID is derived from the connected wallet; the wallet receives the complete 60/40 initial allocation in two tranches for a single-wallet demonstration.
3. Confirm asset creation, then choose **Submit yield** with the same prefilled asset ID and period `2026-08`.
4. Select **Exact payment** and submit `2,000` sandbox USDT. The UI mints only the missing test token balance, approves escrow, submits the claim, and asks for a plain-message issuer authorization.
5. The hosted verifier checks the signed sandbox payment source, runs `policy-v1`, simulates the attestation, submits it with its bonded verifier identity, and opens the 60-second challenge window.
6. The report opens automatically. Copyable full claim, attestation, and report identifiers are displayed.
7. Either choose **Challenge** during the window with the exact `0.25 tBOT` bond, or wait 60 seconds and choose **Finalize after 60s**.
8. After a verified attestation settles, choose **Claim proceeds**. Because this single-wallet demo owns all initial shares, it withdraws the complete verified escrow.

Every wallet prompt should be read before signing. The off-chain authorization message is bound to the claim ID and chain `968`; the hosted endpoint additionally verifies that the signer is the claim's on-chain issuer.

## Three-minute video storyboard

### 0:00–0:25 — Problem

“Tokenization proves a token exists. It does not prove the underlying asset actually earned the yield an issuer claims.” Show the vault and the statement: **Make real-world yield prove itself.**

### 0:25–1:15 — Verified path

Create the asset, submit the 2,000 USDT exact-payment fixture, approve escrow, sign issuer authorization, and open the six-rule report. Show the bonded attestation on BOTScan, wait through the challenge window, settle, and claim the snapshot entitlement.

### 1:15–2:15 — The money shot

Use the recorded adversarial bundle to show a false approval being challenged. Display the 0.25 tBOT challenger bond, resolver overturn, verifier slash from 5 to 3 tBOT, blocked vault state, and delayed issuer refund. Emphasize that investors receive zero when evidence does not justify release.

### 2:15–2:45 — Why the mechanism matters

Show the trust boundary: probabilistic extraction proposes facts; signed sources and deterministic policy decide; a bonded attestation can be challenged; the vault alone releases funds.

### 2:45–3:00 — Proof and roadmap

Show the public site, source repository, BOTScan contracts, limitations disclosure, and the production roadmap from sandbox payment rails to regulated bank/property-management integrations.

## Submission copy

### Name

Veritable — Verifiable revenue rails for tokenized real-world assets

### One-line pitch

Veritable prevents unverified RWA income from reaching investors by placing signed evidence, deterministic policy, and a slashable AI verifier between an issuer's yield claim and on-chain distribution.

### Problem

Most RWA systems can prove token ownership while still trusting the issuer's statement that rent, revenue, or interest was earned. That gap permits unsupported yield claims, weak auditability, and distribution before contradictions are resolved.

### Solution

An issuer registers committed asset terms and escrows a period claim in USDT. A constrained verifier reconciles evidence into typed facts, validates a signed payment-source record, and runs a versioned deterministic policy. The verifier bonds BOT behind its on-chain attestation. Anyone can challenge during the published window; a false approval can be overturned and slashed. Only a settled VERIFIED outcome unlocks pull-based payments to the exact token-holder snapshot.

### Why BOT Chain

BOT Chain's EVM execution, native BOT collateral, RWA focus, and AI Agent Economy make it possible to turn an off-chain agent's claim into an economically accountable on-chain action. BOT is not decorative gas in Veritable: it is the verifier and challenger collateral that makes accuracy consequential.

### What is technically distinctive

- AI/automation extracts and reconciles evidence but cannot directly release funds.
- Signed source records, canonical hashes, typed schemas, and `policy-v1` make decisions reproducible.
- EIP-712 nonces and deadlines bind attestations to the registered asset policy and terms.
- Snapshot-based pull payments prevent transfer-time entitlement manipulation and holder loops.
- Wrong attestations can be challenged, overturned, and slashed with explorer-verifiable consequences.
- Duplicate event delivery, service restart, and repeated hosted requests do not create duplicate attestations.

### Limitations

The challenge environment uses a clearly labeled signed sandbox payment rail and test USDT. It does not claim production bank connectivity, legal asset ownership verification, KYC/AML, or guaranteed fraud detection. Production rollout requires regulated data providers, private evidence storage, operating controls, audits, and jurisdiction-specific compliance.

### Required final links

- Product: https://veritable-web-sigma.vercel.app
- Source: `[REVIEWABLE_REPOSITORY_URL]`
- BOT Mainnet deployment: `[MAINNET_MANIFEST_OR_BOTSCAN_LINKS]`
- Demo video: `[VIDEO_URL]`
- Testnet evidence: `deployments/bot-testnet/acceptance.json`, `deployments/bot-testnet/public-demo.json`, and `deployments/bot-testnet/fresh-wallet-production.json`

Do not submit while any bracketed field remains unresolved.

## Rubric evidence map

| Review dimension | Weight | Evidence to lead with |
|---|---:|---|
| Product completion | 30% | Public wallet flow from asset creation through escrow, report, settlement, and holder claim |
| BOT Mainnet integration | 25% | Mainnet bytecode, official USDT, role wiring, low-value transaction bundle, BOTScan links |
| Innovation | 20% | Yield gating plus slashable verifier accountability; deterministic trust boundary |
| User experience | 15% | Fresh-wallet onboarding, automatic test asset defaults, full copyable proof IDs, one-minute public audit path |
| Technical quality | 10% | 45-test suite, wrong-chain gates, snapshot invariants, EIP-712 replay protection, idempotent recovery, secret scan |

## Mainnet migration gate

Mainnet is chain `677` and is intentionally absent from the active deployment targets. Migration begins only after separate authorization and must include:

1. Re-run official BOT documentation and contract-address verification immediately before deployment.
2. Replace MockUSDT with the confirmed official Mainnet USDT contract and verify six-decimal behavior.
3. Create dedicated Mainnet deployer, verifier, resolver, evidence signer, and treasury identities; never reuse Testnet keys.
4. Fund minimum operational BOT and use small-value claims.
5. Deploy, verify bytecode/source where supported, run the full post-deployment doctor, and record a versioned Mainnet manifest.
6. Exercise verified, blocked, and challenged paths with low values; confirm no role, address, or chain-ID drift.
7. Rebuild the public application with Mainnet addresses, re-run the stranger test, and only then update submission claims.

The production deployer additionally requires the exact `ALLOW_MAINNET_DEPLOYMENT=DEPLOY_VERITABLE_TO_BOT_MAINNET_677` confirmation, a dedicated deployer key, five explicit operational role addresses, explicit bond/timing parameters, official-USDT metadata, and at least four distinct operational identities. It deploys no mock token or seeded demo asset and removes the temporary deployer's operational/admin roles after wiring.
