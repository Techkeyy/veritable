# Veritable submission dossier

Status timestamp: **2026-08-18 (WAT)**

## Project declaration

Veritable is an original hackathon build created for the BOT Chain AI × RWA Builder Challenge. It combines an evidence-constrained verification agent with a bonded, challengeable on-chain attestation that gates RWA-income distribution. Third-party dependencies are listed in the lockfile and retain their own licenses; no third-party product is represented as original work.

The live Testnet registry's EIP-712 signing domain uses the legacy compatibility identifier `VeriFi Attestation Registry`. Public branding is Veritable; the fixed domain is disclosed because changing it would invalidate deployed-contract signatures.

## Final submission fields

| Field | Value | State |
|---|---|---|
| Project | Veritable — Proof of income before distribution | Ready |
| Primary track | RWA Applications | Ready |
| AI capability | Evidence extraction/reconciliation feeding deterministic policy and a slashable verifier attestation | Ready |
| Public product | https://veritable-web-sigma.vercel.app | Live |
| Testnet contracts/evidence | `deployments/bot-testnet/manifest.json` and evidence bundles | Proven |
| Testnet completion audit | `deployments/bot-testnet/completion-audit.json` | 46/46 passed |
| Public source | https://github.com/Techkeyy/veritable | Public |
| BOT Mainnet contracts | Deferred by user | Out of current scope |
| Demo video | `[PUBLIC_DEMO_VIDEO_URL]` | Requires recording and upload |

Do not submit while a required bracketed publication value remains. Mainnet is intentionally deferred and must not be represented as deployed.

## Judge proof path

1. Open the public product and browse the live marketplace offerings without a wallet.
2. Inspect the canonical claim `0x1b547def2d1d6be5c508e357650fdd7366bd21b1b44ceb11c4e503b6d7a69c1a` and its eight deterministic rules, either in the product or directly against `/v1/reports/<claimId>`. Its evidence rail is a real onchain USDT payment plus a live DeepSeek extraction, recorded in `deployments/bot-testnet/canonical-claim.json`.
3. Verify the hosted attestation and settlement links on BOTScan.
4. Review `deployments/bot-testnet/fresh-wallet-production.json` for an independent full public write path.
5. Review `deployments/bot-testnet/acceptance.json` for the 60/40 verified distribution and challenged false-approval slash/refund path.
6. Review the Mainnet evidence ledger once migration is authorized and completed.

## Evidence-backed claims

- 60 automated tests cover policy, API, agent recovery, contract state transitions, and cross-layer behavior.
- A fresh in-memory wallet completed asset creation, escrow, hosted verification, settlement, and exact withdrawal through the public product.
- A deliberately false approval was challenged, overturned, and financially slashed on BOT Testnet.
- The public verifier endpoint authenticates the on-chain issuer and is idempotent.
- BOT Mainnet preflight checks chain 677, official USDT code/symbol/decimals, compiled bytecode hashes, and required operational separation without broadcasting.

## Honest limitations

The current evidence rail is a signed sandbox fixture, not production banking connectivity. Veritable does not claim legal title verification, KYC/AML coverage, universal fraud detection, or decentralized dispute governance. A production launch requires regulated data providers, private storage controls, independent audits, multisig governance, and jurisdiction-specific legal review.

## Reproduction

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm --filter @veritable/web build
pnpm --filter @veritable/web build:sites
pnpm audit --prod
pnpm run doctor -- --network bot-testnet --require-deployment
pnpm preflight:mainnet
```

The Mainnet deployment command is deliberately locked and must not be run without separate authorization, dedicated Mainnet identities, explicit parameters, and a green readiness report.
