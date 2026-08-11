import { describe, expect, it } from "vitest";
import { assertExpectedChain, runtimeChainConfig } from "./index.js";

describe("chain configuration", () => {
  it("defaults all development work to BOT Testnet 968", () => {
    expect(runtimeChainConfig("bot-testnet", {}).chain.id).toBe(968);
  });

  it("keeps Mainnet explicitly separate at chain 677", () => {
    expect(runtimeChainConfig("bot-mainnet", {}).chain.id).toBe(677);
  });

  it("fails closed on a wrong deployment chain", () => {
    expect(() => assertExpectedChain(677, 968)).toThrow(/Deployment stopped/);
  });
});
