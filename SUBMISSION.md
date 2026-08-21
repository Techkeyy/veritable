# Veritable submission dossier

Status timestamp: **2026-08-21 (WAT)**

## Project declaration

Veritable is an original build for the BOT Chain AI x RWA Builder Challenge. It combines evidence-constrained AI extraction with deterministic policy and a bonded, challengeable on-chain attestation that gates RWA-income distribution. Third-party dependencies are listed in the lockfile and retain their own licenses.

## Final submission fields

| Field | Value | State |
|---|---|---|
| Project | Veritable: Proof of income before distribution | Ready |
| Primary track | RWA Applications | Ready |
| AI capability | DeepSeek extracts evidence facts; deterministic policy decides; a bonded verifier attests | Ready |
| Mainnet product | https://veritable-mainnet.vercel.app | Live |
| Mainnet report | https://veritable-mainnet.vercel.app/v1/reports/0xfbe58b8e43f82b0ffb77a61185b592aa58b9c1686705b54842ea553ec9faebd8 | VERIFIED |
| Mainnet contracts | `deployments/bot-mainnet/manifest.json`, chain 677, block 20300480 | Deployed |
| Mainnet canonical evidence | `deployments/bot-mainnet/canonical-claim.json` | Settled 60/40 |
| Protected Testnet | https://veritable-web-sigma.vercel.app | Live |
| Testnet audit | `deployments/bot-testnet/completion-audit.json` | 46/46 passed |
| Public source | https://github.com/Techkeyy/veritable | Public |
| Demo video | Human must record, upload, and paste the final public URL into the submission form | Human-only |

## Mainnet judge path

1. Open the Mainnet product and its public report.
2. Confirm claim `0xfbe58b8e43f82b0ffb77a61185b592aa58b9c1686705b54842ea553ec9faebd8` is `VERIFIED` with eight PASS rules.
3. Verify the [0.010000 USDT income payment](https://scan.botchain.ai/tx/0x4cb04a9b2cb9e2c99e4ca31e59729187fa850f6bcf7214b60a709eb1094d7056).
4. Verify the [bonded attestation](https://scan.botchain.ai/tx/0x6494c68dce64e62e214226dfa0488a7c4d79232cec24e679fce24f6ed0ff44dc).
5. Verify [settlement](https://scan.botchain.ai/tx/0x30bda9d8b5701c3f1e1a45b22376a85d9c7caf302fa2a0209b33b0877a45ce28) after the 600-second challenge window.
6. Verify the [0.006000 USDT issuer withdrawal](https://scan.botchain.ai/tx/0x2c52ec0a60ce029f9d6d9f0cf7d32f9b01a42397811e43ddf91984c4c0e85a7e) and [0.004000 USDT payer withdrawal](https://scan.botchain.ai/tx/0x6ac4083304867ce5ef9605ba145b7d9a91cf9b91e02e0738da1ad16faed87d81).

The first Mainnet claim, `0x87f90afb0a867b87905670146055017dab7e6efb610a45398c633c1f6ef05beb`, remains historical evidence of fail-closed `INCONCLUSIVE` handling. It was not modified, repaired, or hidden.

## Testnet adversarial proof

- `pnpm audit:testnet` passes 46 of 46 read-only checks.
- A deliberately false approval was challenged, overturned, slashed, and refunded.
- The protected Testnet marketplace and complete VERIFIED canonical flow remain available.
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

The current evidence rail proves a BOT Chain payment plus a live model extraction. It does not provide production bank connectivity, legal title verification, KYC or AML coverage, universal fraud detection, or decentralized dispute governance. Production rollout still requires regulated data providers, stronger private-storage controls, multisig operations, independent audits, and jurisdiction-specific legal review.

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
