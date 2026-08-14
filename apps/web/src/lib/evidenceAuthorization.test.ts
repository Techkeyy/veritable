import { describe, expect, it } from "vitest";
import { evidencePreparationMessage, evidenceRequestMessage } from "./evidenceAuthorization";

describe("evidence preparation authorization", () => {
  it("binds the wallet, period, proof, document, and chain", () => {
    const message = evidencePreparationMessage({
      requester: "0x1111111111111111111111111111111111111111",
      periodKey: "2026-08",
      proofReference: `BOT_TRANSACTION:0x${"22".repeat(32)}`,
      documentHash: `0x${"33".repeat(32)}`,
      chainId: 968,
    });
    expect(message).toContain("Requester: 0x1111111111111111111111111111111111111111");
    expect(message).toContain("Period: 2026-08");
    expect(message).toContain(`Payment proof: BOT_TRANSACTION:0x${"22".repeat(32)}`);
    expect(message).toContain(`Document hash: 0x${"33".repeat(32)}`);
    expect(message).toContain("Chain ID: 968");
  });

  it("binds a payer request to both wallets and the exact evidence facts", () => {
    const message = evidenceRequestMessage({
      issuer: "0x1111111111111111111111111111111111111111",
      payer: "0x2222222222222222222222222222222222222222",
      periodKey: "2026-08",
      amountMinor: "125000000",
      paidAt: "2026-08-12",
      documentHash: `0x${"33".repeat(32)}`,
      chainId: 968,
    });
    expect(message).toContain("Issuer: 0x1111111111111111111111111111111111111111");
    expect(message).toContain("Payer: 0x2222222222222222222222222222222222222222");
    expect(message).toContain("Amount minor: 125000000");
    expect(message).toContain("Paid at: 2026-08-12");
    expect(message).toContain(`Document hash: 0x${"33".repeat(32)}`);
  });
});
