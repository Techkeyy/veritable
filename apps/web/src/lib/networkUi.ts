export interface NetworkUiCopy {
  settlementToken: "USDT" | "TestUSDT";
  paymentMethod: string;
  paymentDescription: string;
  sendPayment: string;
  paymentTransaction: string;
  marketplaceEyebrow: string;
  marketplaceDescription: string;
  marketplaceDisclaimer: string;
}

export function networkUiCopy(isMainnet: boolean): NetworkUiCopy {
  return isMainnet
    ? {
        settlementToken: "USDT",
        paymentMethod: "On-chain USDT payment",
        paymentDescription: "Send or paste a USDT transfer",
        sendPayment: "Send an on-chain payment",
        paymentTransaction: "Or paste a USDT transaction",
        marketplaceEyebrow: "Public marketplace",
        marketplaceDescription: "Buy revenue-share tokens with USDT. You only collect yield after Veritable verifies the income.",
        marketplaceDisclaimer: "BOT Mainnet. These are public onchain primary issuances, not legal securities or a secondary market.",
      }
    : {
        settlementToken: "TestUSDT",
        paymentMethod: "Testnet payment",
        paymentDescription: "Send or paste a TestUSDT transfer",
        sendPayment: "Send a test payment",
        paymentTransaction: "Or paste a TestUSDT transaction",
        marketplaceEyebrow: "Public Testnet marketplace",
        marketplaceDescription: "Buy revenue-share tokens with TestUSDT. You only collect yield after Veritable verifies the income.",
        marketplaceDisclaimer: "Testnet sandbox only. These are public onchain primary issuances, not legal securities or a secondary market.",
      };
}

export function requireTestUsdtMint(isMainnet: boolean) {
  if (isMainnet) throw new Error("TestUSDT minting is unavailable on BOT Mainnet");
}

export function testnetFundingControlsAvailable(isMainnet: boolean) {
  return !isMainnet;
}

export function settlementFundingAction(input: {
  isMainnet: boolean;
  balance: bigint;
  required: bigint;
}): "READY" | "MINT_TEST_USDT" {
  if (input.balance >= input.required) return "READY";
  if (input.isMainnet) throw new Error("This wallet needs USDT on BOT Mainnet before it can continue");
  return "MINT_TEST_USDT";
}
