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

export const wagmiConfig = createConfig({
  chains: [botTestnet],
  connectors: [injected()],
  transports: { [botTestnet.id]: http() },
  ssr: true,
});

export const contracts = {
  assetFactory: process.env.NEXT_PUBLIC_ASSET_FACTORY_ADDRESS as `0x${string}` | undefined,
  vault: process.env.NEXT_PUBLIC_YIELD_VAULT_ADDRESS as `0x${string}` | undefined,
  attestation: process.env.NEXT_PUBLIC_ATTESTATION_REGISTRY_ADDRESS as `0x${string}` | undefined,
  staking: process.env.NEXT_PUBLIC_VERIFIER_STAKING_ADDRESS as `0x${string}` | undefined,
  settlement: process.env.NEXT_PUBLIC_SETTLEMENT_TOKEN_ADDRESS as `0x${string}` | undefined,
};

export const isConfigured = Object.values(contracts).every(Boolean);
