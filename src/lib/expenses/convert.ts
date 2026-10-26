import "server-only";
import { resolveFxRate } from "@/lib/bank/fx";
import { expectedGbpPenceFromForeign } from "@/lib/expenses/currency";
import type { ExpenseParsed } from "@/lib/expenses/schema";
import { FORM_FIELD_ERROR_SUMMARY } from "@/lib/validation/field-errors";

/**
 * Sterling pence for a foreign amount at the Bank of England rate on
 * `spentAt` (today when unset). Null when there's no rate for the currency
 * or the Bank of England can't be reached.
 */
export async function sterlingFromForeign(
  currency: string,
  amountMinor: number,
  spentAt: string | null,
): Promise<number | null> {
  const onDate = spentAt || new Date().toISOString().slice(0, 10);
  const rate = await resolveFxRate(currency, onDate).catch(() => null);
  if (!rate) return null;
  return expectedGbpPenceFromForeign(amountMinor, rate.foreignPerGbp);
}

/**
 * Fill in a foreign expense's sterling amount when none was entered. With
 * `required`, fails if it can't be converted; otherwise leaves it at zero
 * (a pending draft).
 */
export async function withSterlingAmount(
  data: ExpenseParsed,
  opts: { required: boolean },
): Promise<
  | { ok: true; data: ExpenseParsed }
  | { ok: false; error: string; fieldErrors: Record<string, string> }
> {
  const { foreignCurrency, originalAmountMinor } = data;
  if (!foreignCurrency || data.amountPence > 0) return { ok: true, data };
  if (originalAmountMinor && originalAmountMinor > 0) {
    const pence = await sterlingFromForeign(
      foreignCurrency,
      originalAmountMinor,
      data.spentAt || null,
    );
    if (pence != null && pence > 0) return { ok: true, data: { ...data, amountPence: pence } };
  }
  if (!opts.required) return { ok: true, data };
  const message = `Couldn't get a ${foreignCurrency} exchange rate. Enter the amount in GBP.`;
  return {
    ok: false,
    error: FORM_FIELD_ERROR_SUMMARY,
    fieldErrors: { amountPounds: message },
  };
}
