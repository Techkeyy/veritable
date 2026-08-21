# Judge runbook and submission draft

## Release truth table

| Gate | Evidence | Status |
|---|---|---|
| Complete BOT Testnet contracts | `deployments/bot-testnet/manifest.json` | Passed |
| Release and 60/40 holder withdrawal | `deployments/bot-testnet/acceptance.json` | Passed |
| False approval challenge, slash, and refund | `deployments/bot-testnet/acceptance.json` | Passed |
| Hosted verifier attestation and idempotency | `deployments/bot-testnet/public-demo.json` | Passed |
| Production build | `pnpm build` | Passed |
| Mainnet website | https://veritable-mainnet.vercel.app | Passed |
| Reviewable source repository | https://github.com/Techkeyy/veritable | Passed |
| Fresh external wallet stranger test | `deployments/bot-testnet/fresh-wallet-production.json` | Passed |
| BOT Mainnet deployment | `deployments/bot-mainnet/manifest.json` | Passed |
| Mainnet canonical claim | `deployments/bot-mainnet/canonical-claim.json` | VERIFIED and settled 60/40 |

Veritable is live on BOT Chain Mainnet with official USDT and a completed low-value canonical claim. Testnet remains the adversarial evidence environment for challenge, slash, refund, marketplace, and larger-value demonstrations.

## Fast judge path

### Read-only proof in under one minute

1. Open https://veritable-mainnet.vercel.app and choose **Inspect report**.
2. The Mainnet canonical claim ID is `0xfbe58b8e43f82b0ffb77a61185b592aa58b9c1686705b54842ea553ec9faebd8`.
3. Load the report and inspect eight deterministic rules, the full claim ID, attestation ID, and report hash. Two of those rules cover the live DeepSeek extraction; the remaining six cover the onchain payment proof.
4. Verify the attestation: https://scan.botchain.ai/tx/0x6494c68dce64e62e214226dfa0488a7c4d79232cec24e679fce24f6ed0ff44dc
5. Verify settlement: https://scan.botchain.ai/tx/0x30bda9d8b5701c3f1e1a45b22376a85d9c7caf302fa2a0209b33b0877a45ce28
6. Verify the underlying income payment: https://scan.botchain.ai/tx/0x4cb04a9b2cb9e2c99e4ca31e59729187fa850f6bcf7214b60a709eb1094d7056
7. Verify exact 60/40 withdrawals: `0.006000` and `0.004000 USDT`.

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

### 0:00-0:25: Problem

“Tokenization proves a token exists. It does not prove the underlying asset actually earned the yield an issuer claims.” Show the vault and the statement: **Make real-world yield prove itself.**

### 0:25-1:15: Verified path

Show the completed Mainnet `0.010000 USDT` claim, all eight PASS rules, the bonded attestation, the 600-second challenge deadline, settlement, and exact `0.006000` plus `0.004000 USDT` withdrawals.

### 1:15-2:15: The money shot

Use the recorded adversarial bundle to show a false approval being challenged. Display the 0.25 tBOT challenger bond, resolver overturn, verifier slash from 5 to 3 tBOT, blocked vault state, and delayed issuer refund. Emphasize that investors receive zero when evidence does not justify release.

### 2:15-2:45: Why the mechanism matters

Show the trust boundary: probabilistic extraction proposes facts; signed sources and deterministic policy decide; a bonded attestation can be challenged; the vault alone releases funds.

### 2:45-3:00: Proof and roadmap

Show the public site, source repository, BOTScan contracts, limitations disclosure, and the production roadmap from sandbox payment rails to regulated bank/property-management integrations.

## Submission copy

### Name

Veritable: Verifiable revenue rails for tokenized real-world assets

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

Mainnet uses official USDT and an on-chain payment proof, but Veritable does not claim production bank connectivity, legal asset ownership verification, KYC or AML coverage, or guaranteed fraud detection. Production rollout requires regulated data providers, stronger private evidence controls, operating controls, audits, and jurisdiction-specific compliance.

### Required final links

- Product: https://veritable-mainnet.vercel.app
- Source: https://github.com/Techkeyy/veritable
- BOT Mainnet deployment: `deployments/bot-mainnet/manifest.json`
- Mainnet report: https://veritable-mainnet.vercel.app/v1/reports/0xfbe58b8e43f82b0ffb77a61185b592aa58b9c1686705b54842ea553ec9faebd8
- Demo video: human must record and upload the final public video
- Testnet evidence: `deployments/bot-testnet/acceptance.json`, `deployments/bot-testnet/public-demo.json`, and `deployments/bot-testnet/fresh-wallet-production.json`

All engineering fields are resolved. Video recording and submission-form delivery remain human-only.

## Rubric evidence map

| Review dimension | Weight | Evidence to lead with |
|---|---:|---|
| Product completion | 30% | Public wallet flow from asset creation through escrow, report, settlement, and holder claim |
| BOT Mainnet integration | 25% | Mainnet bytecode, official USDT, role wiring, low-value transaction bundle, BOTScan links |
| Innovation | 20% | Yield gating plus slashable verifier accountability; deterministic trust boundary |
| User experience | 15% | Fresh-wallet onboarding, automatic test asset defaults, full copyable proof IDs, one-minute public audit path |
| Technical quality | 10% | 91-test suite, wrong-chain gates, snapshot invariants, EIP-712 replay protection, idempotent recovery, secret-safe evidence |

## Mainnet proof summary

- Chain: `677`
- Official USDT: `0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C`, six decimals
- Canonical asset: `0x74198af012fc9ed1ff013f1962bdd8e42bd7dde6f95c8b87c16d957a0b90f790`
- Canonical claim: `0xfbe58b8e43f82b0ffb77a61185b592aa58b9c1686705b54842ea553ec9faebd8`
- Outcome: `VERIFIED`, eight PASS rules
- Attestation: settled after the 600-second challenge window with no challenger
- Distribution: `6000 + 4000 = 10000` minor units, no dust
