# Testing, deployment, and submission

## 1. Test pyramid

### Pure policy tests

- money/date/reference normalization;
- each rule independently;
- complete decision table;
- golden and adversarial evidence corpus;
- report canonicalization and hash stability.

### Contract tests

- every state transition and role boundary;
- signature/nonces/deadlines;
- 6-decimal arithmetic and rounding;
- snapshot entitlement across transfers;
- challenge timing and both resolution outcomes;
- stake lock/withdraw/slash;
- reentrancy and pause behavior;
- fuzz and fund-conservation invariants.

### Service tests

- invalid/malicious uploads;
- payment-source signature/expiry;
- model malformed JSON and timeout;
- RPC duplication/gaps/reconnect;
- idempotent DB/outbox behavior;
- public/private report redaction.

### End-to-end tests

- local exact-pay release;
- local underpay block;
- local false approval challenge/slash;
- BOT testnet wallet flow;
- low-value BOT Mainnet smoke flow.

## 2. Doctor command

`pnpm run doctor -- --network <local|bot-testnet|bot-mainnet>` must report pass/fail for:

- configured HTTP and WSS reachability;
- live chain ID equals manifest chain ID;
- latest block advances;
- historical log capability or configured recovery provider;
- official USDT has code, symbol `USDT`, decimals `6` on Mainnet;
- deployed contract code hashes match manifest;
- registry/vault/staking addresses point to each other correctly;
- required roles are assigned and unexpected roles absent;
- agent has sufficient available stake and BOT gas;
- deployer/relayer balances are nonzero but within operational limits;
- storage/database/model adapter health;
- public web/API health and build version;
- explorer links resolve.

Never print private keys, database URLs with credentials, signed evidence URLs, or model secrets.

## 3. Reproducibility

Planned commands:

```bash
pnpm install --frozen-lockfile
pnpm dev:infra
pnpm seed
pnpm test
pnpm demo:local
pnpm doctor --network local
```

Ship `.env.example`, version pins, deployment manifests, seed fixtures, and exact setup steps tested from a clean clone. A devcontainer/Docker Compose setup is preferred if local Windows toolchain friction does not directly benefit the product.

## 4. Deployment runbook

1. Run tests, static analysis, production builds, and secret scan.
2. Run `doctor` against target network.
3. Confirm chain ID aloud/in terminal: testnet 968 or Mainnet 677.
4. Confirm deployer address and BOT balance.
5. Confirm settlement token; Mainnet must equal documented official USDT and live metadata checks.
6. Simulate/estimate each deployment where supported.
7. Deploy contracts in dependency order.
8. Persist manifest after every confirmed receipt.
9. Grant cross-contract roles and verify them through reads.
10. Transfer/restrict administration.
11. Verify source and constructor arguments on BOTScan.
12. Run low-value submit/attest/settle/claim and block/challenge/slash smoke cases.
13. Bind web/API/agent to immutable manifest version.
14. Re-run doctor and capture evidence links.

Do not redeploy to hide a failed transaction. Document it and fix forward.

## 5. Mainnet evidence ledger

Maintain a generated `deployments/bot-mainnet/evidence.json` with:

- repository commit;
- deployment timestamp and chain ID;
- contract names/addresses/verification URLs;
- deployment and role-setup transaction hashes;
- exact-pay claim/attestation/settlement/holder-claim transactions;
- blocked claim transaction;
- challenged attestation/resolution/slash transactions;
- site/API build identifiers;
- test/doctor command results.

The README and submission must source counts/links from this ledger rather than hand-maintained prose.

## 6. Demo video storyboard

### 0:00-0:25: Problem

“A token can exist on-chain while its reported income remains an issuer promise. Veritable requires proof of income before distribution.”

### 0:25-1:10: Valid income

Show the lease terms, 2,000 USDT claim, AI evidence reconciliation, BOT bond, final attestation, BOTScan proof, and investor USDT claim.

### 1:10-1:55: The money shot

Submit a 2,000 claim against a signed 1,200 payment record. Pause on the mismatch report and show that the vault releases zero.

### 1:55-2:35: Economic accountability

Show a deliberately incorrect verifier approval, challenge it, resolve against the verifier, and show its BOT stake decrease plus the blocked vault.

### 2:35-2:55: Product/trust

Show verification history, limitations, verified Mainnet contracts, and the long-term path from sandbox source to bank/property APIs and decentralized resolvers.

No code walkthrough unless needed to prove one technical detail.

## 7. Submission checklist

This checklist tracks final hackathon publication. Engineering and Mainnet execution are complete; video recording and submission-form delivery remain human-only.

- [x] BOT Chain Mainnet deployment
- [x] Public website/online demo
- [x] Wallet connection and complete core workflow
- [x] Accessible GitHub repository/reviewer access
- [x] Original project declaration
- [x] Verified contract links
- [ ] Demo video
- [x] Primary track and accurate technology tags
- [x] Business logic/value loop description
- [x] AI core-capability explanation
- [x] RWA authenticity and compliance-feasibility disclosure
- [x] Long-term roadmap and BOT Chain ecosystem contribution
- [x] Test/reproduction instructions
- [x] Limitations and trust model
- [x] All engineering submission fields populated
- [ ] Submission completed by Aug 21, leaving Aug 22 as buffer

## 8. Final five-minute audit

1. `git status` clean.
2. Tests/build/doctor green; displayed counts match current output.
3. Fresh wallet can connect and complete the intended flow.
4. All explorer, site, repository, report, and video links work logged out.
5. Mainnet address manifest matches the deployed bytecode.
6. Example outputs regenerated from current code.
7. No unsupported claims, secret values, raw personal data, or “coming soon” features presented as live.
8. Submission is visibly accepted before the deadline.
