# Risk-first build plan

Target submission deadline from the supplied rules: **2026-08-22 23:59 UTC+8 = 2026-08-22 16:59 WAT**. Submit a valid draft early; improve it afterward.

## Phase 0 — Foundation and pipeline map

Deliverables:

- monorepo skeleton and pinned tool versions;
- canonical schemas and money/date conventions;
- architecture decision records;
- local Hardhat EDR chain plus 6-decimal MockUSDT;
- seeded exact-pay, underpay, missing, and ambiguous fixtures;
- `doctor` command skeleton.

Exit gate: one command starts the local dependencies and the fixture bundle validates.

## Phase 1 — Prove the risky core first

Build no marketplace polish yet.

### Contract spike

Implement the minimal vault, bond, attestation, challenge, settlement, snapshot, and holder claim path. Prove both release and slash with tests.

### Verification spike

Implement:

- signed fixture payment source;
- structured extraction interface;
- deterministic policy v1;
- report hashing;
- EIP-712 signing;
- WebSocket event subscription plus idempotent processing.

Exit gate:

```text
valid fixture -> VERIFIED -> settle -> correct holder payment
underpaid fixture -> BLOCKED -> zero holder payment
false approval -> challenge -> slash -> block
```

All must run locally from a repeatable command. If this phase fails, redesign before building UI.

## Phase 2 — Harden contracts and tests

Deliverables:

- complete contract set and events/errors;
- snapshot-based distribution;
- role, pause, refund, and dust behavior;
- unit, fuzz, invariant, and integration tests;
- gas snapshot and static analysis;
- deployment scripts and address manifest schema.

Exit gate: every invariant in the contract design has an automated test and all three critical scenarios pass.

## Phase 3 — Evidence/API/agent service

Deliverables:

- authenticated issuer evidence upload;
- private object storage and content hashing;
- Postgres job/read model;
- fixture payment oracle with signatures;
- agent retry/dead-letter behavior;
- redacted public reports;
- health and doctor endpoints;
- optional real model provider behind an adapter, with deterministic fixture adapter for tests.

Exit gate: service restart and duplicate event delivery produce exactly one on-chain attestation.

## Phase 4 — Critical product UI

Build screens in workflow order:

1. network/wallet onboarding;
2. asset registration and terms review;
3. share allocation/acquisition sandbox;
4. issuer claim/evidence/USDT approval and deposit;
5. verification state timeline and report;
6. challenge/resolution panel;
7. investor entitlement and claim;
8. public asset verification history;
9. verifier stake/reputation page.

Exit gate: a fresh browser/wallet completes the full flow without CLI intervention.

## Phase 5 — BOT testnet rehearsal

Deliverables:

- contracts deployed to chain 968;
- source verified where supported;
- WSS/HTTP behavior measured;
- wallet switching exercised;
- full seeded demo run;
- deployment/rollback notes;
- updated `doctor` checks from observed behavior.

Exit gate: another person follows the runbook successfully.

## Phase 6 — Mainnet deployment early

Deploy the minimum complete contracts to chain 677 before final polish. Use official USDT and small values.

Deliverables:

- verified BOTScan contracts;
- versioned Mainnet manifest;
- real BOT verifier stake;
- public website bound to Mainnet addresses;
- three low-value scenario transaction bundles;
- evidence links in README/submission draft.

Exit gate: public site and explorer independently prove the core business loop.

## Phase 7 — Adversarial and reliability pass

Run the threat-model corpus, disconnect RPC/model/storage, restart the agent, change wallets/networks, double-click actions, replay signatures, and test deadline boundaries.

Exit gate: failures degrade to pending/inconclusive/blocked, never automatic release.

## Phase 8 — Product edge and submission

Deliverables:

- homepage led by “Proof of income before distribution”;
- actual Mainnet output, not mock screenshots;
- limitations/trust disclosure;
- rubric evidence matrix;
- clean README and one-command setup;
- 2.5–3 minute demo video with pre-mapped screens;
- submitted form with all fields complete;
- backup offline fixture demo.

Exit gate: a five-minute stranger test—understand, try, and verify without author explanation.

## Calendar

| Date (WAT) | Primary outcome |
|---|---|
| Aug 11 | Architecture, research, repo and fixtures locked |
| Aug 12 | Minimal contracts prove release/block/slash locally |
| Aug 13 | Agent policy, signed evidence, EIP-712, golden tests |
| Aug 14 | Contract hardening, fuzz/invariants, deployment scripts |
| Aug 15 | API/storage/indexer and restart/idempotency proof |
| Aug 16 | Issuer/investor critical UI complete |
| Aug 17 | Challenge/staking/public-history UI; full local rehearsal |
| Aug 18 | BOT testnet full run and contract verification |
| Aug 19 | BOT Mainnet minimum complete deployment |
| Aug 20 | Adversarial pass, UX polish, real Mainnet evidence |
| Aug 21 | Record video and submit complete draft |
| Aug 22 by 16:59 | Final verification, links, contingency buffer |

## Scope-cut order

If behind schedule, remove in this order without damaging the thesis:

1. gas sponsorship;
2. WalletConnect/mobile wallet extras;
3. marketplace discovery/filtering;
4. multiple assets;
5. sophisticated analytics/reputation;
6. issuer self-service asset factory UI.

Never cut challenge/slash, Mainnet integration, exact USDT distribution, evidence report, network guard, or the three critical scenarios.

## Definition of done

- public Mainnet product and source repository;
- wallet connects and completes core business loop;
- all contracts verified and linked;
- official USDT used with correct decimals;
- tests and doctor checks pass with counts generated by CI;
- no secrets or fake claims;
- limitations disclosed;
- video and submission completed before deadline.
