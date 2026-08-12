# Veritable submission dossier

Status timestamp: **2026-08-12 (WAT)**

## Project declaration

Veritable is an original hackathon build created for the BOT Chain AI × RWA Builder Challenge. It combines an evidence-constrained verification agent with a bonded, challengeable on-chain attestation that gates RWA-income distribution. Third-party dependencies are listed in the lockfile and retain their own licenses; no third-party product is represented as original work.

The live Testnet registry's EIP-712 signing domain uses the legacy compatibility identifier `VeriFi Attestation Registry`. Public branding is Veritable; the fixed domain is disclosed because changing it would invalidate deployed-contract signatures.

## Final submission fields

| Field | Value | State |
|---|---|---|
| Project | Veritable — Proof of income before distribution | Ready |
| Primary track | RWA Applications | Ready |
| AI capability | Evidence extraction/reconciliation feeding deterministic policy and a slashable verifier attestation | Ready |
| Public product | https://verifi-bot-chain.cheery-bowl-9509.chatgpt.site | Live |
| Testnet contracts/evidence | `deployments/bot-testnet/manifest.json` and evidence bundles | Proven |
| Public source | `[PUBLIC_GITHUB_URL]` | Requires publication approval |
| BOT Mainnet contracts | `[BOT_MAINNET_MANIFEST_AND_EXPLORER_LINKS]` | Requires migration authorization/funding |
| Demo video | `[PUBLIC_DEMO_VIDEO_URL]` | Requires recording and upload |

Do not submit while a bracketed value remains.

## Judge proof path

1. Open the public product and select **Inspect report**.
2. Inspect the prefilled canonical claim and its six deterministic rules.
3. Verify the hosted attestation and settlement links on BOTScan.
4. Review `deployments/bot-testnet/fresh-wallet-production.json` for an independent full public write path.
5. Review `deployments/bot-testnet/acceptance.json` for the 60/40 verified distribution and challenged false-approval slash/refund path.
6. Review the Mainnet evidence ledger once migration is authorized and completed.

## Evidence-backed claims

- 45 automated tests cover policy, API, agent recovery, contract state transitions, and cross-layer behavior.
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
