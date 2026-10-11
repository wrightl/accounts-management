import type { MatchScoreBreakdown } from "@/lib/bank/match";

function dayGap(dateScore: number): number {
  // Date score falls by 2 points a day from 100.
  return Math.round((100 - dateScore) / 2);
}

function dateText(days: number, target: string): string {
  if (days === 0) return `dated the same day as the ${target}`;
  return `dated within ${days} day${days === 1 ? "" : "s"} of the ${target}`;
}

/**
 * One plain-English line on why a bank row was matched, built from the
 * scorer's own breakdown so it can't claim more than the matcher checked.
 */
export function explainMatch(params: {
  matchType: "invoice_payment" | "expense" | "reimbursement";
  breakdown: MatchScoreBreakdown;
  note: string | null;
}): string {
  const { breakdown, matchType, note } = params;
  if (note?.startsWith("AI:")) return note.slice(3).trim();
  const parts: string[] = [];
  if (note) {
    parts.push("Within the expected range for the foreign-currency amount");
  } else {
    parts.push("Exact amount");
  }
  if (breakdown.dateScore > 0) {
    const target =
      matchType === "invoice_payment" ? "invoice" : matchType === "expense" ? "receipt" : "reimbursement";
    parts.push(dateText(dayGap(breakdown.dateScore), target));
  }
  if (breakdown.invoiceRefScore >= 80) parts.push("the reference quotes the invoice number");
  if (breakdown.counterpartyScore >= 70) parts.push("the payer's name matches the client");
  if (breakdown.paymentRefScore >= 60) {
    parts.push(
      matchType === "expense"
        ? "the bank description names the same merchant"
        : "the reference matches",
    );
  }
  const [first, ...rest] = parts;
  if (rest.length === 0) return `${first}.`;
  return `${first}, ${rest.slice(0, -1).join(", ")}${rest.length > 1 ? " and " : ""}${rest.at(-1)}.`;
}
