import { configVariable, defineConfig } from "hardhat/config";
import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";
import dotenv from "dotenv";
import { resolve } from "node:path";

dotenv.config({ path: resolve(import.meta.dirname, "../../.env"), quiet: true });

export default defineConfig({
  plugins: [hardhatToolboxViem],
  solidity: {
    profiles: {
      default: {
        version: "0.8.24",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          viaIR: true,
        },
      },
      production: {
        version: "0.8.24",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          viaIR: true,
        },
      },
    },
  },
  networks: {
    botTestnet: {
      type: "http",
      chainType: "l1",
      chainId: 968,
      url: configVariable("BOT_TESTNET_RPC_URL"),
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY"), configVariable("VERIFIER_PRIVATE_KEY")],
    },
    botMainnet: {
      type: "http",
      chainType: "l1",
      chainId: 677,
      url: configVariable("BOT_MAINNET_RPC_URL"),
      accounts: [configVariable("MAINNET_DEPLOYER_PRIVATE_KEY")],
    },
  },
});
