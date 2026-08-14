# Product and scope

## 1. Problem

An RWA issuer can tokenize an income-bearing asset and report rent or revenue each period, but the blockchain cannot natively determine whether that income was actually earned under the asset agreement. Sending funds to a vault proves liquidity, not economic provenance.

Veritable verifies the relationship between:

- registered asset terms;
- the issuer's period claim;
- payment-rail evidence;
- uploaded supporting evidence; and
- the amount proposed for distribution.

## 2. Product promise

Before a claim is distributable, Veritable produces a structured verification report and a bonded attestation. The protocol then either releases the verified escrow after a challenge period or holds it without representing it as earned yield.

The safe marketing claim is:

> Veritable prevents unverified capital from being represented and distributed as earned RWA income.

Avoid claims such as “AI proves reality,” “fully trustless bank verification,” or “guaranteed fraud prevention.”

## 3. Actors

| Actor | Responsibility | Economic position |
|---|---|---|
| Issuer | Registers the sandbox asset, supplies terms, escrows USDT, and submits evidence | Claimant; escrow remains locked until resolution |
| Investor | Acquires or receives revenue-share tokens and claims released USDT | Protected beneficiary |
| Verifier agent | Reconciles evidence, signs a typed attestation, and locks BOT stake | Earns fee; can lose stake |
| Challenger | Bonds a challenge and submits counter-evidence | Earns part of a valid slash; loses challenge bond if wrong |
| Resolver | Applies the published resolution policy for the MVP | Trusted multisig/admin, clearly disclosed |
| Guardian | Can pause new claims and settlement during an incident | Cannot seize investor entitlements |

## 4. MVP user journeys

### Issuer

1. Connect wallet on BOT Chain.
2. Register a sandbox rental property and upload a lease/evidence bundle.
3. Configure expected amount, payment window, currency, and redacted tenant reference.
4. Create an issuance and allocate/purchase shares.
5. Escrow issuer-owned inventory in a public fixed-price Testnet offering.
6. Submit a monthly claim and escrow official BOT Chain USDT.
7. Watch verification progress, read the report, and respond to a block or challenge.

### Investor

1. Browse public property offerings, connect a wallet, and acquire sandbox share tokens with TestUSDT.
2. Inspect the asset terms and historic claim outcomes.
3. See pending, verified, blocked, challenged, and settled states.
4. Claim the wallet's exact snapshot-based USDT entitlement after settlement.

### Verifier/challenger

1. Stake BOT and register as a verifier.
2. Agent consumes a claim event, evaluates evidence, and submits a signed attestation.
3. A challenger may bond and challenge before settlement.
4. Resolver decides the disputed assertion; the losing economic party is penalized.

## 5. MVP scope

Must ship:

- one asset class: rental income;
- one settlement token: official BOT Chain USDT on Mainnet;
- one primary verifier agent;
- one deterministic policy version;
- private evidence storage with public content hashes;
- three-state verifier outcome: `VERIFIED`, `BLOCKED`, `INCONCLUSIVE`;
- bonded attestations, challenge bond, resolution, and visible slashing;
- snapshot-based, pull-payment USDT distribution;
- MetaMask-compatible wallet flow and automatic BOT Chain network switch;
- public web app, source repository, verified Mainnet contracts, and demo video.

Explicitly excluded from the hackathon MVP:

- legal token ownership or public securities offering;
- KYC/AML production implementation;
- real Plaid or open-banking credentials;
- multiple asset types or currencies;
- decentralized juror network;
- multi-agent consensus;
- secondary-market liquidity;
- fully private on-chain evidence;
- production property-management integrations.

## 6. Success metrics

| Metric | Target |
|---|---|
| Critical-path Mainnet scenarios | 3/3 demonstrably complete |
| Incorrect automatic releases in golden/adversarial corpus | 0 |
| Contract unit/integration suite | All green |
| Fund-conservation invariant | Never violated |
| Fresh setup | One documented command per service |
| Judge comprehension | Problem and blocked-distribution climax understood in under 60 seconds |

## 7. Judging strategy

The project should be submitted under RWA Applications unless the organizer requires or recommends a different single-track choice. The visible differentiation is **Proof of Income**, not generic tokenization and not generic AI chat.

Every rubric item needs evidence:

| Rubric | Planned evidence |
|---|---|
| Product completion (30%) | Public site; complete issuer, verifier, challenge, and investor loop |
| Mainnet integration (25%) | Chain 677 transaction links, verified contracts, BOT stake, official USDT transfers |
| Innovation (20%) | Period-specific Proof of Income plus bonded AI liability and challenge demo |
| UX (15%) | State timeline, human-readable mismatch report, network guard, transaction links |
| Technical quality (10%) | Tests, invariants, typed schemas, deterministic policy, threat model, doctor command |
