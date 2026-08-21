import { describe, expect, it } from "vitest";
import { parseExtractedAmountMinor, sampleIncomeText } from "./format";

describe("parseExtractedAmountMinor", () => {
  it("accepts dollar strings the model commonly returns", () => {
    expect(parseExtractedAmountMinor("2000")).toBe("2000000000");
    expect(parseExtractedAmountMinor("2000.00")).toBe("2000000000");
    expect(parseExtractedAmountMinor("$2,000.00")).toBe("2000000000");
    expect(parseExtractedAmountMinor("2000 USDT")).toBe("2000000000");
  });

  it("keeps six-decimal minor units", () => {
    expect(parseExtractedAmountMinor("2000000000")).toBe("2000000000");
  });

  it("allows a missing amount", () => {
    expect(parseExtractedAmountMinor(null)).toBeNull();
    expect(parseExtractedAmountMinor("")).toBeNull();
  });

  it("treats non-numeric model output as a missing amount", () => {
    expect(parseExtractedAmountMinor("about two thousand")).toBeNull();
  });
});

describe("sampleIncomeText", () => {
  it("uses the selected network label", () => {
    const document = sampleIncomeText({
      propertyName: "Example",
      amount: "1",
      periodKey: "2026-08",
      dueDate: "2026-08-01",
      networkLabel: "BOT Mainnet",
    });
    expect(document).toContain("Veritable BOT Mainnet verification");
    expect(document).not.toContain("Veritable Testnet verification");
  });
});
