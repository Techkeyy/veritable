import { defineChain, getAddress, type Address, type Chain } from "viem";
import { z } from "zod";

export const botTestnet = defineChain({
  id: 968,
  name: "BOT Chain Testnet",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.bohr.life"] } },
  blockExplorers: { default: { name: "BOTScan Testnet", url: "https://scan.bohr.life" } },
  testnet: true,
});

export const botMainnet = defineChain({
  id: 677,
  name: "BOT Chain",
  nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.botchain.ai"], webSocket: ["wss://ws-rpc.botchain.ai"] },
  },
  blockExplorers: { default: { name: "BOTScan", url: "https://scan.botchain.ai" } },
  testnet: false,
});

export const BOT_MAINNET_USDT = getAddress("0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C");

export const environmentSchema = z.enum(["local", "bot-testnet", "bot-mainnet"]);
export type ChainEnvironment = z.infer<typeof environmentSchema>;

export interface RuntimeChainConfig {
  environment: ChainEnvironment;
  chain: Chain;
  httpRpcUrl: string;
  webSocketRpcUrl?: string;
  settlementToken?: Address;
}

export function runtimeChainConfig(
  environment: ChainEnvironment,
  env: NodeJS.ProcessEnv = process.env,
): RuntimeChainConfig {
  if (environment === "bot-testnet") {
    return {
      environment,
      chain: botTestnet,
      httpRpcUrl: env.BOT_TESTNET_RPC_URL ?? botTestnet.rpcUrls.default.http[0],
      ...(env.BOT_TESTNET_SETTLEMENT_TOKEN
        ? { settlementToken: getAddress(env.BOT_TESTNET_SETTLEMENT_TOKEN) }
        : {}),
    };
  }
  if (environment === "bot-mainnet") {
    return {
      environment,
      chain: botMainnet,
      httpRpcUrl: env.BOT_MAINNET_RPC_URL ?? botMainnet.rpcUrls.default.http[0],
      webSocketRpcUrl:
        env.BOT_MAINNET_WSS_URL ?? botMainnet.rpcUrls.default.webSocket?.[0] ?? "",
      settlementToken: getAddress(env.BOT_MAINNET_USDT_ADDRESS ?? BOT_MAINNET_USDT),
    };
  }
  return {
    environment,
    chain: defineChain({
      id: 31_337,
      name: "VeriFi Local",
      nativeCurrency: { name: "Local BOT", symbol: "BOT", decimals: 18 },
      rpcUrls: { default: { http: [env.LOCAL_RPC_URL ?? "http://127.0.0.1:8545"] } },
    }),
    httpRpcUrl: env.LOCAL_RPC_URL ?? "http://127.0.0.1:8545",
  };
}

export function assertExpectedChain(actual: number, expected: number): void {
  if (actual !== expected) {
    throw new Error(`Wrong chain: connected to ${actual}, expected ${expected}. Deployment stopped.`);
  }
}
