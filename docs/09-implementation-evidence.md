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
- Testnet-only deployment script, automatic role wiring, seeded demo asset/holders/USDT, verifier stake, and generated runtime manifests.
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

The strict wallet doctor currently fails only because `.env` does not yet contain the three local keys. No private values should be pasted into chat or committed.

## Still requires external Testnet state

The following are intentionally not claimed as complete until explorer-verifiable evidence exists:

1. Fund separate deployer and verifier wallets with BOT Testnet gas; verifier needs more than the scripted 25 tBOT stake.
2. Deploy to chain 968 and commit the generated manifest.
3. Run exact-payment, underpayment/block/refund, and false-approval/challenge/slash flows through the public UI.
4. Run the doctor with `--require-deployment` and archive its output plus transaction links.
5. Configure the generated addresses in hosting, publish the site/API, and test from a fresh wallet.
6. Migrate to Mainnet only after every Testnet acceptance item passes.

Mainnet remains absent from the Hardhat deployment targets and locked in the agent runtime.
