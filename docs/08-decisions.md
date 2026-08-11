# Decision log and open questions

## Locked decisions

| Decision | Choice | Reason |
|---|---|---|
| Repository/product naming | `veritable` repo; VeriFi product | User-requested folder plus established concept name |
| Submission lane | RWA primary, AI-native core | Highest challenge alignment without splitting the story |
| Differentiating mechanism | Proof of Income | Narrower and more defensible than generic “AI oracle” novelty |
| Settlement | Official BOT Chain USDT on Mainnet | Real asset distribution; live address/6 decimals verified |
| Verifier stake | Native BOT | Maximum BOT ecosystem alignment and visible economic consequence |
| Decision authority | Deterministic policy | Testable, reproducible, fail-closed behavior |
| AI role | Extract, cross-reference, anomaly flag, explain | Substantive AI without letting nondeterminism authorize funds |
| Evidence privacy | Private blobs; on-chain hashes | Avoid exposing tenant/bank information |
| Distribution | Snapshot plus pull claim | No holder iteration and no transfer-time beneficiary ambiguity |
| Dispute resolver | Disclosed admin/multisig MVP | Feasible before deadline; future decentralized resolution |
| Upgrade approach | Prefer non-upgradeable MVP | Smaller attack/governance surface and clearer judge verification |
| RPC events | WSS plus durable recovery | Official Mainnet HTTP endpoint disables `eth_getLogs` |
| Optional features | Additive and off by default | Protect the stable demo path |

## Questions to resolve during implementation

These do not block Phase 1; choose defaults and record changes.

1. What real or realistically redacted rental asset/evidence can be used without exposing personal data?
2. What BOT stake/challenge amounts are affordable and visually legible on Mainnet?
3. Is a multisig available before Mainnet, or must a temporary resolver EOA be disclosed?
4. Which model provider/key is available? The architecture must keep a provider adapter and deterministic tests.
5. Which hosting/storage provider gives the fastest reproducible deployment?
6. Does BOTScan support automated verification through Hardhat 3, or is manual standard-JSON verification required?
7. Which historical-log provider or explorer API can recover missed events on Mainnet?
8. Is WalletConnect necessary for judging, or is MetaMask-compatible injection sufficient?
9. Will the organizer accept a sandbox revenue-share token without KYC, clearly labeled non-production?
10. Can BOT Chain provide Mainnet gas support early enough for the verifier, deployer, resolver, and demo wallets?

## Stop/go checkpoints

- **After Phase 1:** if release/block/slash cannot be proven repeatably, redesign; do not build UI around it.
- **After testnet:** if WSS recovery or contract verification is unreliable, choose a verified provider/manual runbook before Mainnet.
- **Before Mainnet:** if official USDT/address/decimals or chain ID fails doctor, stop deployment.
- **Before submission:** if a claim cannot be proven with a public transaction or actual behavior, remove it from the pitch.
