# Veritable submission dossier

Status timestamp: **2026-08-21 (WAT)**

Official submission deadline: **August 22, 2026 at 21:59 UTC+8**, which is **August 22 at 14:59 WAT**. Submit early. The linked rules page still displays an older 23:59 time, but the official form itself is the operative and earlier deadline.

## Human-only items before submission

- Register or confirm registration for the challenge.
- Supply team name, each member's name and role, primary Telegram or email, and optional X account.
- Add a BOT Chain BD referral only if one actually exists.
- Record and upload the optional but recommended 2–5 minute demo video.
- Review every declaration and submit the official form. Do not claim originality or participation history without human confirmation.

## Exact form answers

### Section 1: Team information

| Official field | Answer |
|---|---|
| 1. Team Name | Human must supply |
| 2. Team Members | Human must supply each name and role |
| 3. Primary Contact | Human must supply Telegram or email |
| 4. X / Twitter | Human must supply or leave blank |
| 5. BOT Chain BD Referral | Leave blank unless a real referral exists |

### Section 2: Project information

**6. Project Name**

Veritable

**7. Challenge Track**

RWA Applications

**8. Project Overview**

Veritable is a proof-of-income and distribution protocol for tokenized real-world assets. Tokenization can prove ownership and supply, but investors still depend on an issuer's claim that rent or other income actually arrived. Veritable inserts a programmable firewall before payout. An issuer escrows a yield claim and submits source evidence plus an independently verifiable BOT Chain payment. DeepSeek extracts only typed facts, such as amount and due date. Eight deterministic rules compare those facts with committed asset terms and payment proof; the model cannot emit the verdict. A bonded verifier signs the resulting attestation, which remains challengeable before the vault releases funds to the immutable holder snapshot. A false approval can be overturned and slashed. The live BOT Chain Mainnet run used official six-decimal USDT, passed all eight rules, settled after the 600-second window, and paid an exact 60/40 split. Target users are RWA issuers, marketplaces, asset managers, and investors who need auditable income verification before distribution.

**9. Project Status**

New project built for this Challenge

### Section 3A: RWA Applications

**10. RWA area**

Asset Distribution

**11. RWA use case and business model**

Veritable serves recurring-income assets such as rental property, invoices, royalties, and revenue-share agreements. The issuer tokenizes a fixed ownership snapshot, receives real-world income represented by a verified on-chain payment, and escrows the claimed amount. Evidence extraction and deterministic policy establish whether the payment matches the committed amount, payer reference, period, date window, asset, and policy. Only a bonded, challengeable `VERIFIED` attestation unlocks proportional holder withdrawals. The product creates value by replacing issuer-only reporting with a reusable verification and settlement rail. A production business could charge issuers or marketplaces per verified distribution, while verifiers earn fees for accountable attestations and risk stake when wrong.

**12. Why this is RWA rather than general DeFi**

The protocol's core object is not a speculative token trade or generic liquidity position. It is a real-world income obligation with committed terms, documentary evidence, payer identity, payment timing, an income period, and a distribution entitlement. Its eight-rule policy and challengeable verifier bond exist specifically to bridge those off-chain facts into an on-chain payout without treating the issuer's statement as truth.

### Section 3B: AI Native Applications

Not applicable because the selected primary track is RWA Applications. If the form requires these conditional fields, use the following truthful answers.

**10. How AI is used as a core capability**

DeepSeek converts unstructured income evidence into the typed amount, currency, due date, payer reference, period, and document identifiers required by the policy engine. It participates directly in the claim-to-attestation workflow, but it cannot approve a claim: incomplete extraction fails closed.

**11. AI-driven actions or workflows**

The hosted verifier requests extraction, validates completeness, runs the deterministic policy, produces the report, and signs the corresponding on-chain attestation. The system permits at most two extraction attempts and will produce `INCONCLUSIVE`, never `VERIFIED`, when required facts cannot be established.

**12. Why this is more than an AI API wrapper**

The model output is constrained by shared schemas, checked against an independent payment proof and immutable on-chain terms, reduced to eight reproducible rule outcomes, and bound to a staked EIP-712 attestation. Economic settlement follows the deterministic report rather than model prose.

### Section 4: Existing project or migration

Not applicable. Veritable is a new project built for this challenge, not a migrated historical entry.

### Section 5: Project verification

**17. BOT Chain integration**

Select all four: Core contracts deployed on BOT Chain; Frontend supports BOT Chain; Wallet interaction completed; Core business workflow completed.

**18. BOT Chain Mainnet contracts and explorer links**

- [AssetRegistry](https://scan.botchain.ai/address/0xfc9dbf0a8468aa56799b4e23b1ebe936426ee30b)
- [AssetFactory](https://scan.botchain.ai/address/0xdd3366c1aecec5f439f58d824f446c794d54b089)
- [PrimaryOfferingMarketplace](https://scan.botchain.ai/address/0xf2d77abff2d699f370a83a067b643642a4f5ee77)
- [VerifierStaking](https://scan.botchain.ai/address/0xafa7bd24051a4336da9560c7929a3d103c52bcb2)
- [YieldVault](https://scan.botchain.ai/address/0x97205b095ac6ebe0e932a9a36e5955b92b165ca1)
- [AttestationRegistry](https://scan.botchain.ai/address/0x8dea0de1e273d3b2f8a221f96ba464c27af23240)
- [Official USDT](https://scan.botchain.ai/address/0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C)

The authoritative repository record is [deployments/bot-mainnet/manifest.json](deployments/bot-mainnet/manifest.json), chain 677, deployment block 20300480.

**19. Mainnet deployment transaction hash**

`0x3a46f30eab4db8f0117ee228e85eeb3f861a54ca9430b40fd04f9267111e2277` ([AssetRegistry creation](https://scan.botchain.ai/tx/0x3a46f30eab4db8f0117ee228e85eeb3f861a54ca9430b40fd04f9267111e2277))

### Section 6: Product and demo

**20. Live Product / Demo URL**

https://veritable-mainnet.vercel.app

**21. GitHub Repository**

https://github.com/Techkeyy/veritable

**22. Demo Video**

Human must paste the final public 2–5 minute video URL. The official form marks this field optional but recommends it for fast judging.

### Section 7: Final declaration

Human must review and confirm the form's accuracy, rules compliance, originality, non-duplication, authorization to use all code and intellectual property, valid Mainnet deployment, and independently verifiable product. These declarations cannot be made automatically.

## Mainnet judge path

1. Open the [Mainnet product](https://veritable-mainnet.vercel.app) and [public report](https://veritable-mainnet.vercel.app/v1/reports/0xfbe58b8e43f82b0ffb77a61185b592aa58b9c1686705b54842ea553ec9faebd8).
2. Confirm claim `0xfbe58b8e43f82b0ffb77a61185b592aa58b9c1686705b54842ea553ec9faebd8` is `VERIFIED` with eight PASS rules.
3. Verify the [0.010000 USDT income payment](https://scan.botchain.ai/tx/0x4cb04a9b2cb9e2c99e4ca31e59729187fa850f6bcf7214b60a709eb1094d7056).
4. Verify the [bonded attestation](https://scan.botchain.ai/tx/0x6494c68dce64e62e214226dfa0488a7c4d79232cec24e679fce24f6ed0ff44dc).
5. Verify [settlement](https://scan.botchain.ai/tx/0x30bda9d8b5701c3f1e1a45b22376a85d9c7caf302fa2a0209b33b0877a45ce28) after the 600-second challenge window.
6. Verify the [0.006000 USDT issuer withdrawal](https://scan.botchain.ai/tx/0x2c52ec0a60ce029f9d6d9f0cf7d32f9b01a42397811e43ddf91984c4c0e85a7e) and [0.004000 USDT payer withdrawal](https://scan.botchain.ai/tx/0x6ac4083304867ce5ef9605ba145b7d9a91cf9b91e02e0738da1ad16faed87d81).

The first Mainnet claim, `0x87f90afb0a867b87905670146055017dab7e6efb610a45398c633c1f6ef05beb`, remains historical evidence of fail-closed `INCONCLUSIVE` handling. It was not modified, repaired, or hidden.

## Testnet adversarial proof

- `pnpm audit:testnet` passes 46 of 46 read-only checks.
- A deliberately false approval was challenged, overturned, slashed, and refunded.
- The [protected Testnet product](https://veritable-web-sigma.vercel.app), marketplace, and complete VERIFIED canonical flow remain available.
- Evidence is recorded in `deployments/bot-testnet/acceptance.json` and `deployments/bot-testnet/canonical-claim.json`.

## Evidence-backed claims

- The Mainnet settlement token is official six-decimal USDT.
- The Mainnet canonical claim escrowed and verified exactly 10,000 minor units.
- All eight deterministic rules passed.
- The bonded attestation waited through the on-chain 600-second challenge window.
- On-chain transfer logs prove exact 6,000 and 4,000 minor-unit withdrawals with no dust.
- The public verifier fails closed on incomplete extraction and permits at most two extraction attempts.
- The full automated suite, typecheck, production build, dependency audit, and Testnet audit pass.

## Honest limitations

The current evidence rail proves a BOT Chain payment plus a live model extraction. Public reports expose rule outcomes and cryptographic commitments, not private source documents, so independently rerunning extraction requires issuer-authorized evidence access. The product does not provide production bank connectivity, legal title verification, KYC or AML coverage, universal fraud detection, or decentralized dispute governance. Production rollout still requires regulated data providers, stronger private-storage controls, multisig operations, independent audits, and jurisdiction-specific legal review.

## Reproduction

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
pnpm audit --prod --audit-level high
pnpm audit:testnet
```

No additional Mainnet transaction is required for submission.
