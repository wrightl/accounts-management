/**
 * Expense currencies. amountPence is always sterling; an expense paid in
 * another currency also keeps that amount (originalAmountMinor) and its
 * currency (detectedCurrency). Safe to import from client components.
 */
import { isForeignCurrency } from "@/lib/expenses/receipt-parse";

/**
 * Bank of England daily spot series, quoted as foreign units per £1.
 * These are the currencies an expense can be entered in besides GBP.
 */
export const BOE_SERIES_BY_CURRENCY: Record<string, string> = {
  USD: "XUDLUSD",
  EUR: "XUDLERD",
  JPY: "XUDLJYD",
  CHF: "XUDLSFD",
  AUD: "XUDLADD",
  CAD: "XUDLCDD",
  SEK: "XUDLSKD",
  NOK: "XUDLNKD",
  DKK: "XUDLDKD",
};

export const EXPENSE_CURRENCIES = ["GBP", ...Object.keys(BOE_SERIES_BY_CURRENCY)];

/** Convert a foreign amount (minor units) to sterling pence at `foreignPerGbp`. */
export function expectedGbpPenceFromForeign(
  foreignAmountPence: number,
  foreignPerGbp: number,
): number {
  if (!(foreignPerGbp > 0) || !Number.isFinite(foreignPerGbp)) {
    throw new Error(`Invalid FX rate: ${foreignPerGbp}`);
  }
  return Math.round((foreignAmountPence / 100 / foreignPerGbp) * 100);
}

/**
 * The foreign currency and amount an expense was paid in, or null for a
 * sterling expense. Older approved expenses can have a currency but no
 * original amount; their amountPence is what the books use, so they count
 * as sterling.
 */
export function expenseOriginalAmount(expense: {
  detectedCurrency: string | null;
  originalAmountMinor: number | null;
}): { currency: string; amountMinor: number } | null {
  if (!isForeignCurrency(expense.detectedCurrency) || expense.originalAmountMinor == null) {
    return null;
  }
  return {
    currency: expense.detectedCurrency!.trim().toUpperCase(),
    amountMinor: expense.originalAmountMinor,
  };
}
