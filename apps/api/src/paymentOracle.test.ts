import { describe, expect, it } from "vitest";
import { verifyMessage } from "viem";
import { scenarioRecord, signPaymentRecord } from "./paymentOracle.js";

const PRIVATE_KEY = `0x${"01".padStart(64, "0")}` as const;

describe("sandbox payment oracle", () => {
  it("returns exact and underpaid records as distinct signed facts", async () => {
    const exact = await signPaymentRecord(scenarioRecord("rent-paid-exact"), PRIVATE_KEY);
    const underpaid = await signPaymentRecord(scenarioRecord("rent-underpaid"), PRIVATE_KEY);
    expect(exact.record.amountMinor).toBe("2000000000");
    expect(underpaid.record.amountMinor).toBe("1200000000");
    expect(exact.record.payloadHash).not.toBe(underpaid.record.payloadHash);
    expect(
      await verifyMessage({
        address: exact.signer as `0x${string}`,
        message: { raw: exact.record.payloadHash as `0x${string}` },
        signature: exact.signature as `0x${string}`,
      }),
    ).toBe(true);
  });

  it("models missing payments without inventing an amount", () => {
    const missing = scenarioRecord("rent-missing");
    expect(missing.status).toBe("NOT_FOUND");
    expect(missing.amountMinor).toBeUndefined();
  });
});
