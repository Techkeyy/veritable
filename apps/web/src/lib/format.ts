import { formatUnits } from "viem";

export const RULE_COPY: Record<string, string> = {
  AI_EXTRACTION_PRESENT: "The document was readable",
  AI_TERMS_MATCH: "The lease matches the rent you registered",
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
    return "This month’s rent is approved. Investors can claim after the challenge window.";
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

export function sampleLeaseText(input: {
  propertyName: string;
  amount: string;
  periodKey: string;
  dueDate: string;
}) {
  return [
    "LEASE AGREEMENT",
    `Property: ${input.propertyName || "Demo rental property"}`,
    `Monthly rent: ${input.amount || "2000"} USD`,
    `Due date: ${input.dueDate || firstOfPeriod(input.periodKey) || "the 1st of the month"}`,
    `Period: ${periodLabel(input.periodKey || currentPeriodKey())}`,
    "Tenant reference: redacted",
    "",
    "This is a sandbox document for Veritable Testnet verification.",
    "It is not a legal lease and does not represent a real tenant or bank payment.",
  ].join("\n");
}
