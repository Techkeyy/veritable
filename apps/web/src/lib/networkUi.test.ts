import { describe, expect, it } from "vitest";
import {
  networkUiCopy,
  requireTestUsdtMint,
  settlementFundingAction,
  testnetFundingControlsAvailable,
} from "./networkUi";

describe("network-aware settlement UI", () => {
  it("preserves the Testnet mint action and TestUSDT copy", () => {
    expect(settlementFundingAction({ isMainnet: false, balance: 0n, required: 1n })).toBe("MINT_TEST_USDT");
    expect(() => requireTestUsdtMint(false)).not.toThrow();
    expect(testnetFundingControlsAvailable(false)).toBe(true);
    expect(networkUiCopy(false)).toMatchObject({
      settlementToken: "TestUSDT",
      paymentMethod: "Testnet payment",
      sendPayment: "Send a test payment",
      marketplaceEyebrow: "Public Testnet marketplace",
    });
  });

  it("refuses TestUSDT minting on Mainnet when settlement funds are insufficient", () => {
    expect(() => settlementFundingAction({ isMainnet: true, balance: 0n, required: 1n }))
      .toThrow("This wallet needs USDT on BOT Mainnet");
    expect(() => requireTestUsdtMint(true)).toThrow("TestUSDT minting is unavailable on BOT Mainnet");
    expect(testnetFundingControlsAvailable(true)).toBe(false);
  });

  it("uses Mainnet payment and marketplace copy without faucet terminology", () => {
    const copy = networkUiCopy(true);
    expect(copy).toMatchObject({
      settlementToken: "USDT",
      paymentMethod: "On-chain USDT payment",
      sendPayment: "Send an on-chain payment",
      marketplaceEyebrow: "Public marketplace",
    });
    expect(Object.values(copy).join(" ")).not.toMatch(/TestUSDT|Testnet|faucet/i);
  });

  it("allows a funded Mainnet wallet to continue without minting", () => {
    expect(settlementFundingAction({ isMainnet: true, balance: 1n, required: 1n })).toBe("READY");
  });
});
