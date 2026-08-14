import { describe, expect, it } from "vitest";
import { evidencePreparationMessage } from "./evidenceAuthorization";

describe("evidence preparation authorization", () => {
  it("binds the wallet, period, payer, document, and chain", () => {
    const message = evidencePreparationMessage({
      requester: "0x1111111111111111111111111111111111111111",
      periodKey: "2026-08",
      payerReferenceHash: `0x${"22".repeat(32)}`,
      documentHash: `0x${"33".repeat(32)}`,
      chainId: 968,
    });
    expect(message).toContain("Requester: 0x1111111111111111111111111111111111111111");
    expect(message).toContain("Period: 2026-08");
    expect(message).toContain(`Payer reference hash: 0x${"22".repeat(32)}`);
    expect(message).toContain(`Document hash: 0x${"33".repeat(32)}`);
    expect(message).toContain("Chain ID: 968");
  });
});
