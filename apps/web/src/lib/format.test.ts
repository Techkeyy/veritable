import { describe, expect, it } from "vitest";
import { parseExtractedAmountMinor } from "./format";

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
