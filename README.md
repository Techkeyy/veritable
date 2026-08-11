# Veritable

Repository name: **veritable**  
Product name: **VeriFi**  
Tagline: **Proof of income before distribution.**

VeriFi is an economically accountable verification layer for real-world-asset income. An issuer escrows a yield claim, an evidence-constrained AI agent extracts and reconciles the supporting records, deterministic policy produces a verdict, and a bonded on-chain attestation gates release to token holders. Incorrect attestations can be challenged and slashed.

## Product thesis

RWA tokenization can prove that a token exists, while still asking investors to trust the issuer's account of what the underlying asset earned. VeriFi inserts a programmable yield firewall between an issuer's claim and investor distribution.

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

## Non-negotiable acceptance test

The Testnet build is not demo-ready until a fresh wallet can complete all three cases through the public UI and produce explorer-verifiable BOT Testnet transactions:

1. A valid income claim settles and a holder claims the correct USDT share.
2. A mismatched or unsupported claim fails closed and distributes nothing.
3. A deliberately incorrect verifier attestation is challenged, reversed, and slashed according to the published rule.

## Current status

Implementation is active. The pinned pnpm monorepo, deterministic `policy-v1`, trusted-signer sandbox payment evidence, six-contract protocol, issuer asset factory, ordered/idempotent event worker, redacted public reports, BOT Testnet deployment automation, and wallet-connected protocol console are implemented. Forty-four automated tests currently prove the full signed-evidence-to-holder pipeline, verified release with snapshot entitlements, blocked distribution and refund, challenged false approval with BOT slashing, locked-stake safety, policy and terms binding, all-or-nothing escrow, deadline boundaries, replay rejection, trusted-source integrity, wrong-period rejection, restart recovery, bounded dead-letter behavior, and fail-closed policy behavior. The web app also passes its production build.

Public hosting and the live BOT Testnet contract deployment remain pending. Deployment requires a funded BOT Testnet deployer and verifier; Mainnet execution remains deliberately disabled. Any future README claim must remain backed by a command, test, transaction, deployment, or visible product behavior.

## Testnet quick start

1. Copy `.env.example` to `.env` and add a funded `DEPLOYER_PRIVATE_KEY`, a separately funded `VERIFIER_PRIVATE_KEY`, and the verifier's `EVIDENCE_SIGNER_ADDRESS`.
2. Run `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm typecheck`, and `pnpm run doctor -- --network bot-testnet --wallets`. The doctor derives public addresses without printing secrets, requires separate deployer/verifier wallets, checks verifier funding for the scripted 25 tBOT stake plus gas, and confirms the evidence signer address matches its private key.
3. Run `pnpm deploy:testnet`. The wrong-chain kill switch requires chain ID `968` and writes `deployments/bot-testnet/manifest.json`, `web.env`, and `agent.env`.
4. Apply the generated public addresses to the web environment. Start the evidence API, agent, and web app with `pnpm dev:api`, `pnpm dev:agent`, and `pnpm dev:web`.
5. Run `pnpm run doctor -- --network bot-testnet --require-deployment` to verify live bytecode, wiring, verifier authorization, and available stake.

Never commit `.env`, private keys, or agent state. `bot-mainnet` is not a deployment target in the contract configuration during Phase 1.
