# Veritable

**Proof of income before distribution.** A yield firewall for tokenized real-world assets.

**[Live product](https://veritable-web-sigma.vercel.app)** · **[Slash proof on BOTScan](https://scan.bohr.life/tx/0x82318cab75659f149e73b575848befc7c65ff2954a3ac67f0b966d7b699afb56)** · [Acceptance evidence](deployments/bot-testnet/acceptance.json) · [Completion audit](deployments/bot-testnet/completion-audit.json)

RWA platforms can prove a token exists. They still ask investors to take the issuer's word for what the asset actually earned. Veritable puts a programmable firewall between the claim and the payout: an issuer escrows a yield claim, an evidence-constrained model extracts the supporting records, a deterministic rule engine produces the verdict, and a bonded on-chain attestation gates release. Get the attestation wrong and you lose stake.

> *"The dashboard says the rent came in. Did it?"*

Built for the BOT Chain AI x RWA Builder Challenge. Primary track: RWA Applications, with AI as a core on-chain decision participant.

---

## Why this exists

Tokenization solved custody and supply. It did not solve income truth. Platforms like RealT and Lofty distribute rental yield to holders daily, and the amount distributed is whatever the issuer reports. Chainlink Proof of Reserve answers "does the collateral exist," which is a different question from "did this month's income actually arrive, from the right payer, in the right window."

That leaves a gap where the money moves:

```
   ISSUER CLAIM                    WHAT TOKENIZATION ALREADY PROVES
   "August income: 2,000 USDT"  -> the token exists, supply is fixed
            |
            |     nothing in this gap checks that the money arrived
            v
   INVESTOR DISTRIBUTION           paid out on the issuer's word alone
```

Veritable fills that gap. The verdict is not a model's opinion and not the issuer's assertion: it is a deterministic function of signed evidence, and the verifier that signs it is financially liable for being wrong.

**The product does not claim that a language model creates truth.** It creates an auditable decision from evidence, deterministic policy, explicit trust assumptions, and financial accountability.

---

## What it does

1. **Registers** an asset and mints a fixed-supply revenue-share token (`AssetFactory`, `RevenueShareToken`). Supply is permanently locked at creation.
2. **Lists** issuer inventory in a public fixed-price offering, so any wallet can buy in with TestUSDT and the issuer is paid directly (`PrimaryOfferingMarketplace`).
3. **Escrows** the issuer's income claim in the vault before anything is distributed (`YieldVault`).
4. **Extracts** structured facts from the submitted evidence with a live DeepSeek call, producing an amount and a due date, never a verdict.
5. **Decides** with eight deterministic rules over the extraction and an independently signed payment proof. Same input, same verdict, every run.
6. **Attests** on-chain via EIP-712, backed by a locked verifier bond (`AttestationRegistry`, `VerifierStaking`).
7. **Settles or blocks.** A `VERIFIED` attestation releases exactly the claimed amount against an immutable holder snapshot. Anything else releases nothing.
8. **Challenges and slashes.** A false attestation can be challenged inside the window, overturned by the resolver, and the verifier's stake is cut.

Step 4 is the only nondeterministic step, and it cannot decide anything. It supplies typed facts that step 5 either matches against registered terms or rejects.

---

## Quickstart

```bash
pnpm install --frozen-lockfile
pnpm test          # 60 tests
pnpm typecheck
```

Deploy your own testnet instance:

```bash
pnpm init:testnet-env     # creates testnet-only identities, prints public addresses only
# fund the deployer and verifier from the BOT Testnet faucet, then:
pnpm run doctor -- --network bot-testnet --wallets
pnpm deploy:testnet       # requires chain 968, writes deployments/bot-testnet/manifest.json
pnpm acceptance:testnet   # writes transaction-backed acceptance.json
```

Run the app locally against the deployed contracts:

```bash
pnpm dev:api
pnpm dev:agent
pnpm dev:web
```

Re-verify the live deployment against the chain at any time:

```bash
pnpm audit:testnet        # 46 independent checks against live state
```

Never commit `.env` or private keys. The doctor enforces separate deployer and verifier roles and at least 6 tBOT for the verifier's 5 tBOT demo stake plus gas.

---

## Try the deployed system

The [live product](https://veritable-web-sigma.vercel.app) runs the complete loop on BOT Chain Testnet. Browsing the marketplace and inspecting offerings needs no wallet.

Report inspection resolves against durable evidence storage, so a claim is readable only on the deployment that holds its stored bundle. The canonical `2026-08` demo report predates the current deployment and is not yet re-stored on it. Submit a claim through the runbook below to produce a report you can inspect end to end.

To submit a real claim end to end, follow [docs/12-real-evidence-runbook.md](docs/12-real-evidence-runbook.md). The evidence path accepts no preset scenarios: the model extracts from the document you supply, and payment is proven by a BOT transaction or a counterparty wallet signature.

---

## Architecture

| Module | Job |
|---|---|
| `packages/schemas` | Typed evidence, claim, and report shapes shared by every layer |
| `packages/policy` | Deterministic rule engine, emits verdict plus verified amount |
| `packages/config` | Network, chain, and contract address resolution |
| `packages/contracts` | Seven Solidity contracts and the protocol test suite |
| `packages/doctor` | Preflight health check for wiring, roles, funding, and stake |
| `apps/api` | Evidence intake, payment oracle, public deterministic reports |
| `apps/agent` | Watches vault events, runs extraction and policy, signs attestations |
| `apps/web` | Public marketplace, issuer console, investor holdings and claims |

Contracts: `AssetRegistry`, `AssetFactory`, `RevenueShareToken`, `PrimaryOfferingMarketplace`, `YieldVault`, `AttestationRegistry`, `VerifierStaking`.

---

## Why economic accountability matters

Plenty of systems will let a model label a document. Almost none make the labeller pay for being wrong. Veritable's verifier posts a bond before it can attest, the bond stays locked through the challenge window, and a successful challenge slashes it.

This is not theoretical. On BOT Testnet a deliberately false approval was submitted, challenged, overturned, and the verifier's free stake went from 5 tBOT to 3 tBOT while the blocked escrow was returned to the issuer in full. Every step is a transaction anyone can open:

- [False approval challenged](https://scan.bohr.life/tx/0x275cf40d0ffba0a2ee6bfd5a1e489276516bdcb5f1c14ddc66136e14bd77d73a)
- [Resolver overturn and slash](https://scan.bohr.life/tx/0x82318cab75659f149e73b575848befc7c65ff2954a3ac67f0b966d7b699afb56)
- [Blocked escrow refunded, 1,500 USDT](https://scan.bohr.life/tx/0x32f1a7afffacd1b55ad67bfe1c67f5f57af6f170422cf5b9d4917514f33264b1)

An attestation that costs nothing to get wrong is worth what it costs.

---

## How I tried to break it

Every row below is exercised by a test in the suite or by a recorded testnet transaction.

| Input | Result |
|---|---|
| Happy path: evidence matches registered terms | `VERIFIED`, 2,000 USDT released, holders paid 1,200 and 800 on the 60/40 snapshot |
| Detected amount differs from the claim | `BLOCKED`, nothing released |
| Payment from an unregistered payer reference | `BLOCKED`, nothing released |
| Payment dated outside the configured window | `BLOCKED`, nothing released |
| Payment source unavailable | `INCONCLUSIVE`, never `VERIFIED` |
| Payment record expired | `INCONCLUSIVE`, never `VERIFIED` |
| Model extraction missing or incomplete | `INCONCLUSIVE`, never `VERIFIED` |
| Verifier signs a false `VERIFIED` | Challenged, overturned, stake slashed 5 to 3 tBOT, escrow refunded |
| Same attestation replayed for one claim | Rejected on chain |
| Attestation using the wrong policy hash | Rejected on chain |
| Attestation whose terms differ from the registered commitment | Rejected on chain |
| Partial `VERIFIED` amount | Rejected, so escrow cannot be stranded |
| Settlement attempted before the challenge window closes | Rejected |
| Challenge mined exactly at the deadline | Rejected |
| Holder withdraws twice for one claim | Rejected |
| Verifier withdraws stake while a bond is locked | Rejected |
| Protocol paused after release | New risk stops, an already-released holder can still withdraw |

**Key invariant: any unknown or failed rule can never produce `VERIFIED`, and a non-`VERIFIED` outcome sets the releasable amount to zero.** Unknown evidence blocks the money rather than guessing at it.

**Trust architecture:** the model extracts, the rules decide, the bond makes the decision expensive to get wrong.

---

## Verification status

| Property | Evidence |
|---|---|
| Automated tests | 60 passing (`pnpm test`) |
| Live completion audit | 46 of 46 checks (`pnpm audit:testnet`) |
| Chain | BOT Testnet, chain ID 968, deployment block 19536921 |
| Contracts | Eight addresses in [manifest.json](deployments/bot-testnet/manifest.json), all carrying live bytecode |
| CI | Pinned install, full suite, all-workspace type-check, production build, and production dependency audit on every push |

The Testnet registry keeps the legacy EIP-712 domain string `VeriFi Attestation Registry`. That value is a cryptographic compatibility identifier rather than a product name, and changing it would invalidate signatures for the deployed registry. Deployments on any other chain, including Mainnet, use `Veritable Attestation Registry`.

---

## BOT Chain integration

The protocol targets BOT Chain directly rather than treating it as a generic EVM endpoint. Deployment carries a wrong-chain kill switch that refuses to broadcast unless the RPC reports chain ID 968, the web and agent runtimes are configured from the generated manifest rather than hand-copied addresses, and the EIP-712 domain is derived from `block.chainid` inside `AttestationRegistry` so contract, agent, and web signer can never disagree about the signing domain.

`pnpm preflight:mainnet` is a read-only check that confirms chain ID 677, the official USDT code, symbol and decimals, and the compiled bytecode hashes, all without broadcasting a transaction.

---

## Status and honest limits

**Mainnet is not deployed.** Only the read-only preflight has been run. `deployments/bot-mainnet/` contains `readiness.json` and no manifest, and the deployer address has a nonce of zero on chain 677. Mainnet must not be represented as live.

Not built, and not claimed:

- No bank or regulated payment-processor connectivity. Payment proof is a BOT transaction or a counterparty wallet signature.
- No KYC, AML, or legal securities offering. Nothing here is a compliant sale of a security.
- No secondary market. The marketplace is a primary offering only.
- No legal title verification, no universal fraud detection.
- Single verifier. Multi-agent consensus is design work, not shipped code.
- Dispute resolution uses a single resolver role rather than decentralized governance.
- Durable multi-operator storage, multisig governance, and an independent security audit are production requirements that remain open.

Historical acceptance transactions used labeled fixture evidence with the deployed Testnet settlement token. Those records are valid protocol proofs and are not presented as bank-connected production data.

Any claim in this file must stay backed by a command, a test, a transaction, a deployment, or visible product behavior.

---

## Documentation

[Product scope](docs/00-product-scope.md) · [BOT Chain notes](docs/01-bot-chain-research.md) · [Architecture](docs/02-system-architecture.md) · [Contract design](docs/03-smart-contract-design.md) · [Agent and evidence](docs/04-agent-and-data-design.md) · [Threat model](docs/05-security-threat-model.md) · [Build plan](docs/06-build-plan.md) · [Deployment and submission](docs/07-verification-deployment-submission.md) · [Decisions](docs/08-decisions.md) · [Implementation evidence](docs/09-implementation-evidence.md) · [Judge runbook](docs/10-judge-and-submission-runbook.md) · [Demo sheet](docs/11-demo-production-sheet.md) · [Real evidence runbook](docs/12-real-evidence-runbook.md) · [Submission dossier](SUBMISSION.md)

---

Original work built for the BOT Chain AI x RWA Builder Challenge. Third-party dependencies are listed in `pnpm-lock.yaml` and retain their own licenses.
