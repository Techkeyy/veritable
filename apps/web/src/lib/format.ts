import { formatUnits } from "viem";

export const RULE_COPY: Record<string, string> = {
  AI_EXTRACTION_PRESENT: "The document was readable",
  AI_TERMS_MATCH: "The document matches the income you registered",
  SOURCE_PROOF_VALID: "The payment proof checked out",
  SOURCE_RECORD_FRESH: "The payment record is still valid",
  PAYMENT_PRESENT: "A payment was found",
  AMOUNT_MATCHES: "The paid amount matches the claim",
  PAYER_MATCHES: "It came from the registered payer",
  DATE_IN_WINDOW: "It was paid on time",
};

export function currentPeriodKey(now = new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function firstOfPeriod(periodKey: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(periodKey) ? `${periodKey}-01` : "";
}

const MINOR_UNITS = 1_000_000n;

export function parseExtractedAmountMinor(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const text = String(raw).replace(/[^0-9.]/g, "");
  if (!text || text.toLowerCase() === "null") return null;
  if (/^\d+$/.test(text)) {
    const value = BigInt(text);
    return value < MINOR_UNITS ? (value * MINOR_UNITS).toString() : value.toString();
  }
  if (!/^\d+\.\d{1,8}$/.test(text)) {
    throw new Error("DeepSeek returned an invalid amount");
  }
  const [whole, fraction = ""] = text.split(".");
  const minor = BigInt(whole) * MINOR_UNITS + BigInt((fraction + "000000").slice(0, 6));
  return minor.toString();
}

export function formatAmount(value: bigint | string, decimals = 6) {
  const formatted = formatUnits(typeof value === "string" ? BigInt(value) : value, decimals);
  return formatted.replace(/(\.\d*?[1-9])0+$|\.0+$/g, "$1");
}

export function formatShares(value: bigint | string) {
  return formatAmount(value, 18);
}

export function periodLabel(periodKey: string) {
  const [year, month] = periodKey.split("-").map(Number);
  if (!year || !month) return periodKey;
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

export function symbolFromName(name: string) {
  const letters = name.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return (letters.slice(0, 5) || "RENT").slice(0, 12);
}

export function compactId(value?: string) {
  return value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "";
}

export function outcomeCopy(outcome: "VERIFIED" | "BLOCKED" | "INCONCLUSIVE") {
  if (outcome === "VERIFIED") {
    return "This period’s income is approved. Investors can claim after the challenge window.";
  }
  if (outcome === "BLOCKED") {
    return "The evidence did not support this claim. No yield will be paid.";
  }
  return "The verifier could not decide. Escrow stays locked until the evidence is complete.";
}

export function formatCountdown(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function sampleIncomeText(input: {
  propertyName: string;
  amount: string;
  periodKey: string;
  dueDate: string;
}) {
  return [
    "INCOME STATEMENT",
    `Property: ${input.propertyName || "Demo income property"}`,
    `Period income: ${input.amount || "2000"} USD`,
    `Due date: ${input.dueDate || firstOfPeriod(input.periodKey) || "the 1st of the month"}`,
    `Period: ${periodLabel(input.periodKey || currentPeriodKey())}`,
    "Payer reference: redacted",
    "",
    "This is a sandbox document for Veritable Testnet verification.",
    "It is not a legal agreement and does not represent a real counterparty or bank payment.",
  ].join("\n");
}
