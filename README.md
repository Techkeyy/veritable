# Veritable

Repository name: **veritable**  
Product name: **Veritable**
Tagline: **Proof of income before distribution.**

The accepted Testnet deployment retains the legacy EIP-712 domain string `VeriFi Attestation Registry`. That value is a cryptographic compatibility identifier, not the current product name; changing it would invalidate signatures for the deployed registry. New Mainnet deployments use `Veritable Attestation Registry`.

Veritable is an economically accountable verification layer for real-world-asset income. An issuer escrows a yield claim, an evidence-constrained AI agent extracts and reconciles the supporting records, deterministic policy produces a verdict, and a bonded on-chain attestation gates release to token holders. Incorrect attestations can be challenged and slashed.

## Product thesis

RWA tokenization can prove that a token exists, while still asking investors to trust the issuer's account of what the underlying asset earned. Veritable inserts a programmable yield firewall between an issuer's claim and investor distribution.

The product does **not** claim that an LLM creates truth. It creates an auditable decision from evidence, deterministic policy, explicit trust assumptions, and financial accountability.

## Competition objective

Phase 1 ships a publicly accessible, wallet-connected, reproducible product whose complete critical loop runs on BOT Chain Testnet. Mainnet is a separate, locked migration after the acceptance gate:

`register asset -> issue shares -> escrow USDT claim -> verify evidence -> bond attestation -> challenge/settle -> claim or block yield`

The primary submission lane is **RWA Applications**, with AI as a core on-chain decision participant.

## Planning documents

- [Product and scope](docs/00-product-scope.md)
- [BOT Chain execution notes](docs/01-bot-chain-research.md)
- [System architecture](docs/02-system-architecture.md)
- [Smart-contract design](docs/03-smart-contract-design.md)
- [AI verification and evidence design](docs/04-agent-and-data-design.md)
- [Security and threat model](docs/05-security-threat-model.md)
- [Risk-first build plan](docs/06-build-plan.md)
- [Testing, deployment, and submission](docs/07-verification-deployment-submission.md)
- [Decision log and open questions](docs/08-decisions.md)
- [Current implementation evidence](docs/09-implementation-evidence.md)
- [Judge runbook and submission draft](docs/10-judge-and-submission-runbook.md)
- [Demo production sheet](docs/11-demo-production-sheet.md)
- [Submission dossier](SUBMISSION.md)

## Non-negotiable acceptance test

The Testnet build is not demo-ready until a fresh wallet completes the complete valid-claim path through the public UI and the deployed protocol produces explorer-verifiable BOT Testnet transactions for all three cases:

1. A valid income claim settles and a holder claims the correct USDT share.
2. A mismatched or unsupported claim fails closed and distributes nothing.
3. A deliberately incorrect verifier attestation is challenged, reversed, and slashed according to the published rule.

The malicious-verifier case intentionally uses the adversarial acceptance runner rather than the honest hosted verifier; otherwise the demo would require compromising the production verifier to manufacture a false result.

## Current status

The BOT Testnet protocol and real-evidence application path are implemented. The production UI accepts no preset payment scenarios, fixed terms, fixed periods, demo claim IDs, or verifier-generated evidence. Its preferred path extracts typed document facts with live DeepSeek, binds those facts to an independently signed payment-source record, stores original documents and canonical bundles in private durable object storage, commits the exact bundle hash on BOT Chain, then checks the AI-extracted terms and source signature before a bonded attestation. No bank or payment processor integration is claimed; that remains a disclosed production roadmap item. Golden fixtures remain isolated to automated tests and historical acceptance artifacts.

Every push and pull request runs the pinned install, complete regression suite, all-workspace type-check, production build, and production dependency audit in CI on the repository's pinned Node.js runtime.

The complete contract system is live on BOT Testnet at deployment block `19536921`. Automated live acceptance proved the 2,000 USDT release and 60/40 withdrawal path, then challenged and overturned a false approval, slashed the verifier from 5 to 3 tBOT free stake, and refunded the blocked 1,500 USDT escrow. The hosted-verifier integration also created, verified, idempotently reprocessed, and settled a canonical 2026-08 public demo claim. Public evidence is stored in `deployments/bot-testnet/manifest.json`, `deployments/bot-testnet/acceptance.json`, and `deployments/bot-testnet/public-demo.json`.

The public Testnet product is live at https://verifi-bot-chain.cheery-bowl-9509.chatgpt.site. Historical acceptance transactions used labeled fixture evidence and the deployed Testnet settlement token; those records remain useful protocol proofs but are not presented as bank-connected production data. New claims use the real-evidence path documented in `docs/12-real-evidence-runbook.md`. Mainnet execution remains deliberately disabled pending separate authorization. Any future README claim must remain backed by a command, test, transaction, deployment, or visible product behavior.

`pnpm audit:testnet` independently rechecks the live chain, all deployed bytecode, every recorded acceptance transaction, verified 60/40 conservation, false-approval slash/refund, fresh-wallet payout, public report, brand, and authorization boundary. Its latest 36/36 result is stored in `deployments/bot-testnet/completion-audit.json`.

Mainnet integration is explicitly deferred by the user and is not part of this completion claim. Production bank connectivity, durable multi-operator database/object storage, KYC/AML, multisig governance, and independent audit remain disclosed production roadmap work rather than hackathon-Testnet features.

## Testnet quick start

1. Run `pnpm init:testnet-env`. It creates dedicated testnet-only deployer, verifier, and evidence-signing identities in the ignored `.env`, and prints only their public addresses.
2. Fund the deployer and verifier from the official BOT Testnet faucet, then run `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm typecheck`, and `pnpm run doctor -- --network bot-testnet --wallets`. The doctor requires separate roles, at least 6 tBOT for the verifier's 5 tBOT demo stake plus gas, and a matching evidence signer address.
3. Run `pnpm deploy:testnet`. The wrong-chain kill switch requires chain ID `968` and writes `deployments/bot-testnet/manifest.json`, `web.env`, and `agent.env`.
4. Run `pnpm acceptance:testnet`. It waits through the one-minute testnet gates and writes a secret-free `deployments/bot-testnet/acceptance.json` containing the transaction-backed release/distribution and challenge/slash/refund results.
5. Prepare and externally sign a real evidence bundle using `docs/12-real-evidence-runbook.md`. Start the evidence API, agent, and web app with `pnpm dev:api`, `pnpm dev:agent`, and `pnpm dev:web`, then submit that exact bundle through the UI.
6. Run `pnpm run doctor -- --network bot-testnet --require-deployment --wallets` to verify live bytecode, wiring, role separation, funding, verifier authorization, and available stake.
7. Run `pnpm --filter @veritable/web acceptance:fresh-production` to generate an in-memory disposable wallet and exercise the public hosted write path. Only its public address, proof IDs, and explorer links are written to `deployments/bot-testnet/fresh-wallet-production.json`.

Never commit `.env`, private keys, or agent state. `bot-mainnet` is not a deployment target in the contract configuration during Phase 1.
