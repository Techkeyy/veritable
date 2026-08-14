# Smart-contract design

## 1. Contract set

### `AssetRegistry.sol`

Stores asset identity, issuer, revenue-share token, policy commitment, canonical asset-terms hash, and active/paused status. Enforces a unique asset ID and authorized issuer actions.

### `RevenueShareToken.sol`

ERC-20 representation of sandbox revenue participation. It supports vault-authorized balance snapshots so each period's beneficiaries cannot change after a claim is submitted.

For the MVP, use OpenZeppelin 4.9.x `ERC20Snapshot` or implement an equivalent audited/checkpointed snapshot mechanism. Pin the dependency. Do not silently swap to an incompatible library version.

### `AssetFactory.sol`

Provides bounded, permissionless issuer onboarding. It deploys a fixed-supply revenue-share token, allocates shares to at most 20 initial holders, grants snapshot authority only to the vault, permanently removes all minting and administration authority, and registers the asset through its narrowly scoped registry role. This prevents post-sale dilution.

### `PrimaryOfferingMarketplace.sol`

Provides public Testnet primary issuance without pretending to be a secondary exchange. A registered issuer approves and escrows existing fixed-supply share tokens, chooses an immutable USDT price per whole share, and publishes optional public metadata. Any wallet can approve the exact TestUSDT cost and buy available shares. TestUSDT moves directly to the issuer while shares move from contract escrow to the investor.

Core functions:

```solidity
createListing(assetId, shareAmount, pricePerShareMinor, metadataURI)
buy(listingId, shareAmount, maxCostMinor)
cancelListing(listingId)
getListing(listingId)
```

The contract rechecks asset activity, permits only the registered issuer to list, uses SafeERC20 and a reentrancy guard, rounds fractional-share costs upward to the nearest settlement-token minor unit, and returns unsold inventory only to the issuer.

### `YieldVault.sol`

Custodies USDT, creates one claim per `(assetId, periodKey)`, records the share snapshot, and permits pull-based investor claims only after a valid final attestation.

Core functions:

```solidity
submitClaim(assetId, periodKey, amount, evidenceRoot)
activateRelease(claimId, verifiedAmount) // registry only
blockClaim(claimId)                       // registry only
claimYield(claimId)
refundBlockedClaim(claimId)               // after policy delay
```

Entitlement:

`floor(verifiedAmount * balanceAt(holder, snapshotId) / totalSupplyAt(snapshotId))`

The vault tracks `claimed[claimId][holder]`. Rounding dust has a documented delayed sweep destination and can never be swept before the claim-expiry window.

### `VerifierStaking.sol`

Accepts native BOT stake, tracks free/locked balances, and allows only the registry to lock, unlock, or slash. A verifier cannot withdraw stake backing a live attestation.

Core functions:

```solidity
stake() payable
requestUnstake(amount)
withdrawAfterCooldown()
lock(verifier, attestationId, amount)
unlock(attestationId)
slash(attestationId, challenger, treasury)
```

### `AttestationRegistry.sol`

Validates registered verifier signatures/nonces, records the attestation, opens the challenge window, resolves disputes, and calls the vault exactly once.

Core functions:

```solidity
submitAttestation(attestation, signature)
challenge(attestationId, counterEvidenceRoot) payable
resolve(attestationId, finalOutcome, finalVerifiedAmount)
settle(attestationId)
```

The verifier signs an EIP-712 object containing at least:

```text
chainId
registry address
claimId
assetId
periodKey
claimedAmount
verifiedAmount
outcome
evidenceRoot
reportHash
policyHash
modelRunHash
nonce
deadline
```

## 2. Outcomes

```solidity
enum Outcome { INCONCLUSIVE, VERIFIED, BLOCKED }
```

- `VERIFIED`: releases the complete escrowed claim only after finality. Partial approvals are rejected so no residual escrow can become stranded.
- `BLOCKED`: releases zero; refund policy starts after finality.
- `INCONCLUSIVE`: no actionable attestation; issuer may append evidence and re-run without losing escrow.

Confidence is audit metadata, never an on-chain authorization threshold. The deterministic policy decides the outcome.

## 3. Dispute economics

Initial demo configuration is explicit and configurable:

- verifier minimum total stake: e.g. `100 BOT`;
- per-attestation locked bond: e.g. `10 BOT`;
- challenger bond: denominated in BOT;
- challenge window: long enough for production, shortened only in labeled demo deployment;
- valid challenge: verifier bond slashed, challenger bond returned, slash shared between challenger and protocol treasury;
- invalid challenge: challenger bond partly rewards verifier/treasury;
- resolver: disclosed admin or multisig for MVP.

Exact amounts are deployment configuration, not hard-coded product promises. Before Mainnet, confirm the BOT budget and use values that make the demo observable without risking unnecessary funds.

## 4. Access control

Roles:

- `DEFAULT_ADMIN_ROLE`: multisig/temporary deployer;
- `ASSET_MANAGER_ROLE`: asset onboarding;
- `VERIFIER_ROLE`: registered agent identities;
- `RESOLVER_ROLE`: dispute adjudication;
- `GUARDIAN_ROLE`: pause only;
- `VAULT_ROLE`/`REGISTRY_ROLE`: contract-to-contract calls.

Use two-step ownership/role transfer where applicable. Guardian cannot upgrade, withdraw, resolve, or redirect funds.

## 5. Core invariants

1. Vault USDT outflow never exceeds escrow inflow for a claim.
2. A wallet claims at most once per claim.
3. Sum of holder entitlements plus rounding dust never exceeds `verifiedAmount`.
4. `verifiedAmount <= escrowedAmount`.
5. A claim is activated or blocked at most once.
6. A `(assetId, periodKey)` has at most one live claim.
7. Locked verifier stake cannot be withdrawn.
8. An attestation cannot settle before its challenge deadline.
9. A challenged attestation cannot settle before resolution.
10. Signatures are bound to chain, registry, nonce, and deadline.
11. An attestation policy hash equals the policy hash registered for its asset.
12. A `VERIFIED` attestation covers exactly the full escrowed amount.
13. The attested canonical asset-terms hash equals the terms hash registered for the asset.

## 6. Implementation safeguards

- Solidity pin, pnpm lockfile, Hardhat pin, and OpenZeppelin pinned version;
- `SafeERC20`, `ReentrancyGuard`, checks-effects-interactions;
- custom errors and indexed events;
- explicit 6-decimal tests;
- no loops over investors;
- no `tx.origin`, timestamp equality assumptions, or arbitrary delegate calls;
- pause affects new risk and settlement appropriately but does not permanently trap already-earned investor withdrawals;
- reject fee-on-transfer/rebasing settlement tokens; Mainnet allowlist only official USDT;
- deployment manifest validated against live code and chain ID.

## 7. Build order

Do not start with the factory or marketplace. The first contract spike contains only mock shares, mock 6-decimal USDT, staking, registry, and vault sufficient to prove:

`escrow -> bonded attestation -> challenge/settle -> release/block/slash -> exact holder claim`

Asset registration, issuance UI, and factories follow only after those tests pass.
