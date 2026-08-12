# BOT Chain execution notes

Research snapshot: **2026-08-11**. Treat external configuration as mutable and re-run the project `doctor` checks before testnet and Mainnet deployments.

## 1. Verified network configuration

| Item | Mainnet | Testnet | Status |
|---|---|---|---|
| Chain ID | `677` (`0x2a5`) | `968` | Mainnet verified by live JSON-RPC |
| HTTP RPC | `https://rpc.botchain.ai` | `https://rpc.bohr.life` | Official docs |
| WebSocket RPC | `wss://ws-rpc.botchain.ai` | Confirm before use | Official integration guide |
| Native gas token | BOT | tBOT | Official docs |
| Explorer | `https://scan.botchain.ai` | `https://scan.bohr.life` | Official docs |
| Mainnet USDT | `0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C` | Use a mock token unless official test token is confirmed | Guide plus live contract checks |

Live RPC checks on 2026-08-11 confirmed:

- `eth_chainId` returned `0x2a5` (677);
- the documented USDT address has deployed bytecode;
- `decimals()` returned `6`;
- `symbol()` returned `USDT`.

The application must still verify the address and metadata at runtime. Symbol and decimals do not prove issuer authenticity by themselves.

## 2. RPC architecture consequence

The official JSON-RPC documentation says `eth_getLogs` is disabled on the listed Mainnet HTTP endpoint and recommends WebSockets for frequent log consumption. Therefore:

- the agent uses `wss://ws-rpc.botchain.ai` subscriptions for new events;
- a durable database cursor stores the last processed block and log identity;
- recovery uses explorer/indexer APIs or a confirmed third-party RPC that supports historical logs;
- event handling is idempotent by `(chainId, transactionHash, logIndex)`;
- the agent never assumes a WebSocket connection delivered every event.

This historical recovery path is a Phase 1 risk spike, not an afterthought.

## 3. Wallet and transaction behavior

The web app will support injected EVM wallets through wagmi/viem. On connect it must:

1. read `eth_chainId`;
2. request `wallet_switchEthereumChain` for `0x2a5`;
3. if missing, request `wallet_addEthereumChain` using the official RPC/explorer/native token;
4. refuse state-changing actions on any other network;
5. show transaction status and a BOTScan link.

The official integration guide lists MetaMask and several EVM wallets. MetaMask-compatible injection is the MVP baseline; WalletConnect is optional if it cannot be integrated without schedule risk.

## 4. Settlement asset

Use the official Mainnet USDT contract through `IERC20` and `SafeERC20`. Never hard-code 18 decimals. All UI and contract calculations use the token's 6 decimals.

Local and testnet environments use `MockUSDT` with the same 6-decimal behavior. The mock contract must never be referenced by a Mainnet deployment manifest.

The official bridge describes USDT movement using a lock-and-release liquidity model. Bridging is a user funding path, not part of Veritable's core protocol.

## 5. Deployment and verification

BOT Chain is EVM/Geth compatible and documents Hardhat, Foundry, ethers, web3, Remix, MetaMask, The Graph, and Covalent as compatible tools. This repository uses Hardhat 3 for contracts/tests and viem for TypeScript integration because the available Windows environment does not include Foundry. The choice is pinned and reproducible.

Deployment requirements:

- assert live chain ID before broadcasting;
- deploy from a dedicated deployer wallet with only necessary BOT;
- write addresses, transaction hashes, bytecode hashes, constructor arguments, and block numbers to a versioned manifest;
- verify source code on BOTScan immediately;
- run Mainnet smoke tests with minimal values;
- transfer privileged roles to a multisig if available; otherwise disclose the temporary EOA owner;
- never log or commit private keys.

## 6. Optional BOT-native enhancements

The official docs describe EOA paymaster support and the integration guide lists ERC-4337 bundler endpoints. Gas sponsorship could improve investor claims, but it is a stretch feature. It must not destabilize ordinary wallet transactions; the default path remains normal user-paid BOT gas.

## 7. Documentation inconsistencies and cautions

- The main Quick Guide, integration guide, and live RPC identify Mainnet as chain 677 and Testnet as 968.
- A DEX index page currently labels chain 968 as Mainnet. Treat that line as inconsistent and trust a live chain-ID assertion before deployment.
- Marketing pages report different block/finality figures in different places. Do not encode settlement safety using promotional timing. Use transaction receipts and an explicit configurable confirmation policy.
- The public HTTP RPC limitation makes a naive polling indexer unsafe.
- Explorer UI values are not protocol configuration. Contract addresses come from the official guide and live contract inspection.

## 8. Official sources

- Developer quick guide: https://dev-docs.botchain.ai/docs/Developers/quick-guide/
- JSON-RPC endpoints: https://dev-docs.botchain.ai/docs/Developers/json-rpc-endpoint/
- Developer introduction: https://dev-docs.botchain.ai/docs/intro/
- EOA paymaster: https://dev-docs.botchain.ai/docs/Developers/eoa-paymaster/
- Bridge introduction/core concepts: https://dev-docs.botchain.ai/docs/Bridge/core-concepts/
- Contract explorer: https://scan.botchain.ai/
- Official integration guide: https://docs.google.com/document/d/1xYzdfJlD08UOV9CKE3nV7NTSQg6lPz9B17aIW2NF5Wg/edit
- Official GitHub organization: https://github.com/BOTChain-bot
