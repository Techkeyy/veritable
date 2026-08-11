# Implementation evidence

Last validated: **2026-08-11 (WAT)**

## Completed locally

- Pinned nine-workspace pnpm monorepo.
- Six-contract protocol plus 6-decimal MockUSDT.
- Permissionless, bounded issuer asset factory with role handoff.
- Canonical `policy-v1` and canonical asset-terms commitment.
- Trusted-signer payment evidence and prompt-injection-resistant decision boundary.
- EIP-712 verifier attestations bound to chain, registry, nonce, deadline, policy, terms, report, evidence, asset, period, and amount.
- Ordered log recovery, durable cursor/jobs, idempotency, bounded retries, and dead-letter state.
- Redacted report API with restricted CORS.
- Wallet UI for asset creation, claim submission, report audit, yield withdrawal, verifier staking, challenge, settlement, and resolver reversal.
- Testnet-only deployment script, automatic role wiring, two distinct seeded demo holders, faucet-sized verifier stake, and generated runtime manifests.
- Secret-safe testnet identity initializer and an automated live acceptance runner that emits explorer-linked evidence without private material.
- Live BOT Testnet pre-deployment doctor.

## Verification results

| Evidence | Result |
|---|---|
| `pnpm test` | 44 passed: policy 11, config 3, agent 10, API 4, contracts/cross-layer 16 |
| `pnpm typecheck` | All nine workspaces passed |
| `pnpm --filter @veritable/web build` | Production build passed |
| `pnpm audit --prod` | No known vulnerabilities |
| Repository secret-pattern scan | 0 hits |
| `pnpm run doctor -- --network bot-testnet` | RPC reachable, chain ID 968, live block advancing |
| API HTTP smoke | health 200, authorized CORS preflight 204, unknown report 404 |

The strict wallet doctor passes identity separation and key/address integrity. It remains intentionally red until the generated deployer and verifier receive faucet tBOT. No private values are printed, pasted into chat, or committed.

## Still requires external Testnet state

The following are intentionally not claimed as complete until explorer-verifiable evidence exists:

1. Fund the separate deployer and verifier wallets from the official faucet. The verifier needs at least 6 tBOT for the 5 tBOT demo stake plus gas; the faucet currently advertises 10 tBOT per address every 24 hours.
2. Deploy to chain 968 and commit the generated manifest.
3. Run `pnpm acceptance:testnet` to produce `deployments/bot-testnet/acceptance.json` with exact-payment/release/60-40-claim and false-approval/challenge/overturn/slash/refund transaction links.
4. Repeat the judge-facing workflows through the public UI from a fresh wallet.
5. Run the doctor with `--require-deployment --wallets` and archive its output plus transaction links.
6. Configure the generated addresses in hosting, publish the site/API, and test from a fresh wallet.
7. Migrate to Mainnet only after every Testnet acceptance item passes.

Mainnet remains absent from the Hardhat deployment targets and locked in the agent runtime.
