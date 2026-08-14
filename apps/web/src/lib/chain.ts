import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { defineChain } from "viem";

export const botTestnet = defineChain({
  id: 968,
  name: "BOT Chain Testnet",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_BOT_TESTNET_RPC_URL ?? "https://rpc.bohr.life"] },
  },
  blockExplorers: {
    default: { name: "BOTScan Testnet", url: "https://scan.bohr.life" },
  },
  testnet: true,
});

export const botMainnet = defineChain({
  id: 677,
  name: "BOT Chain",
  nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_BOT_MAINNET_RPC_URL ?? "https://rpc.botchain.ai"] } },
  blockExplorers: { default: { name: "BOTScan", url: "https://scan.botchain.ai" } },
  testnet: false,
});

export const isMainnet = process.env.NEXT_PUBLIC_CHAIN_ENV === "bot-mainnet";
export const writesEnabled = !isMainnet || process.env.NEXT_PUBLIC_ALLOW_MAINNET_WRITES === "ENABLE_VERITABLE_MAINNET_WRITES_677";
export const activeChain = isMainnet ? botMainnet : botTestnet;
export const networkLabel = isMainnet ? "BOT Mainnet" : "BOT Testnet";
export const nativeTokenLabel = isMainnet ? "BOT" : "tBOT";
export const challengeBondBot = process.env.NEXT_PUBLIC_CHALLENGER_BOND_BOT ?? (isMainnet ? undefined : "0.25");
export const challengeWindowSeconds = Number(process.env.NEXT_PUBLIC_CHALLENGE_WINDOW_SECONDS ?? (isMainnet ? "0" : "60"));

export const wagmiConfig = isMainnet
  ? createConfig({
      chains: [botMainnet],
      connectors: [injected()],
      transports: { [botMainnet.id]: http() },
      ssr: true,
    })
  : createConfig({
      chains: [botTestnet],
      connectors: [injected()],
      transports: { [botTestnet.id]: http() },
      ssr: true,
    });

export const contracts = {
  assetRegistry: process.env.NEXT_PUBLIC_ASSET_REGISTRY_ADDRESS as `0x${string}` | undefined,
  assetFactory: process.env.NEXT_PUBLIC_ASSET_FACTORY_ADDRESS as `0x${string}` | undefined,
  vault: process.env.NEXT_PUBLIC_YIELD_VAULT_ADDRESS as `0x${string}` | undefined,
  attestation: process.env.NEXT_PUBLIC_ATTESTATION_REGISTRY_ADDRESS as `0x${string}` | undefined,
  staking: process.env.NEXT_PUBLIC_VERIFIER_STAKING_ADDRESS as `0x${string}` | undefined,
  settlement: process.env.NEXT_PUBLIC_SETTLEMENT_TOKEN_ADDRESS as `0x${string}` | undefined,
  marketplace: process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS as `0x${string}` | undefined,
};

export const isConfigured = Object.values(contracts).every(Boolean);
