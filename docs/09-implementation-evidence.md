# Implementation evidence

Last validated: **2026-08-12 (WAT)**

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
- Live BOT Testnet deployment at block `19536921` with all seven contracts wired and post-deployment doctor checks green.
- Live adversarial acceptance at block `19537392`, recorded in `deployments/bot-testnet/acceptance.json`.

## Verification results

| Evidence | Result |
|---|---|
| `pnpm test` | 45 passed: policy 11, config 3, agent 11, API 4, contracts/cross-layer 16 |
| `pnpm typecheck` | All nine workspaces passed |
| `pnpm --filter @veritable/web build` | Production build passed |
| `pnpm audit --prod` | No known vulnerabilities |
| Repository secret-pattern scan | 0 hits |
| `pnpm run doctor -- --network bot-testnet` | RPC reachable, chain ID 968, live block advancing |
| API HTTP smoke | health 200, authorized CORS preflight 204, unknown report 404 |
| Post-deployment doctor | All bytecode, wiring, role, wallet, signer, and bonded-stake checks passed on chain 968 |
| Live verified path | 2,000 USDT released; holder A received 1,200 and holder B received 800 |
| Live challenged path | False approval overturned; verifier free stake slashed from 5 to 3 tBOT; 1,500 USDT escrow refunded |
| Live app runtime | API 200, web 200, agent cursor advancing, seven workflow tabs rendered, browser console clean |
| Fresh public wallet path | New wallet created asset, escrowed 2,000 sandbox USDT, obtained hosted attestation, settled, and withdrew exactly 2,000 |

## Live BOT Testnet evidence

- Deployment manifest: `deployments/bot-testnet/manifest.json`
- Acceptance bundle: `deployments/bot-testnet/acceptance.json`
- Hosted-verifier demo bundle: `deployments/bot-testnet/public-demo.json`
- Public Sites release: https://veritable-web-sigma.vercel.app
- Public release checks: `deployments/bot-testnet/public-site.json`
- Public release version 3 is built from source commit `ddc44dc62b76906fdf180f99bb52a0da688e08c3` and renders the Veritable brand.
- Live Testnet completion audit: `deployments/bot-testnet/completion-audit.json` — 36/36 checks passed.
- Fresh-wallet production bundle: `deployments/bot-testnet/fresh-wallet-production.json`
- Read-only Mainnet readiness ledger: `deployments/bot-mainnet/readiness.json`
- Asset Registry: `0xa5728e7aab1373d2af4b39d58ee1010167123560`
- Yield Vault: `0x6786d682738d2f0e1d31c113de9aece14ac43f1a`
- Attestation Registry: `0x5e18d2c62257bceddcc21e0a0fd2dd9d6ed79a37`
- Verified settlement: https://scan.bohr.life/tx/0xf4ed56d585bab8f25e928451fb6ac22aed592eb235712be84e6aa26ad67cdda5
- Holder A withdrawal: https://scan.bohr.life/tx/0x23e0cc6c1b3618131db5148827a9828ee689356841b1f0f24262bb56ab566569
- Holder B withdrawal: https://scan.bohr.life/tx/0x1715e4b45efae82b89dd001e6533b6e366f6f014bda981122806f43008be3bfc
- False approval challenge: https://scan.bohr.life/tx/0x275cf40d0ffba0a2ee6bfd5a1e489276516bdcb5f1c14ddc66136e14bd77d73a
- Resolver overturn and slash: https://scan.bohr.life/tx/0x82318cab75659f149e73b575848befc7c65ff2954a3ac67f0b966d7b699afb56
- Blocked escrow refund: https://scan.bohr.life/tx/0x32f1a7afffacd1b55ad67bfe1c67f5f57af6f170422cf5b9d4917514f33264b1
- Hosted-verifier attestation: https://scan.bohr.life/tx/0x1cfacabc40c22afabeb1b5aa424b53e41341bfd23e8a203a105e5d31a1338e68
- Hosted-verifier settlement: https://scan.bohr.life/tx/0x2366cefe6fa245f7d6d998bf9e37c3b3eaeb9c368e58858990a976624d631430
- Fresh-wallet claim submission: https://scan.bohr.life/tx/0x64d5c8b9d12b44f6426ad8eee24805c8006a17c451d59caa4bcc16a6917141e7
- Fresh-wallet hosted attestation: https://scan.bohr.life/tx/0xd9ec1ebd2899739082f251d28aef202e75b3cb08ac09122cbadc28025c7c5fb5
- Fresh-wallet settlement: https://scan.bohr.life/tx/0xfd5983e0e1b554f81b199307ee3bb2e13ac05a3187230d29ba8666266f067b69
- Fresh-wallet full withdrawal: https://scan.bohr.life/tx/0xb0d346cf4f54b1d7706c0ace465216d6256f3f3432dd3ab1ca8b0a84907d22e5

The strict wallet doctor now passes both pre-deployment and phase-aware post-deployment checks. No private values are printed, pasted into chat, or committed.

## Optional publication and deferred production work

The Testnet product itself is complete. These items are intentionally outside that completion claim:

1. Record/upload the demo video and replace the submission runbook's video placeholder.
2. Publish or grant judges access to a reviewable repository URL.
3. Mainnet migration, explicitly deferred by the user.
4. Production bank/data-provider integrations, durable database/object storage, multisig operations, KYC/AML, and independent security review.

The read-only Mainnet preflight currently passes chain ID 677, live block, official USDT bytecode/symbol/6 decimals, compiled protocol bytecode, and Testnet evidence checks. It remains deliberately not ready to deploy because dedicated Mainnet identities, economic parameters, static-analysis review, funding, and explicit authorization are not yet present.

Mainnet code paths remain locked behind explicit confirmation values and are not part of the active product release.
