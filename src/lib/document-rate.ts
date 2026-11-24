import "server-only";
import { resolveFxRate } from "@/lib/bank/fx";
import { isDocumentCurrency, STERLING, type DocumentRate } from "@/lib/currency";

export type DocumentRateDetails = DocumentRate & {
  fxRateDate: string | null;
  fxRateSource: "boe" | "manual" | null;
};

export type DocumentRateResult =
  | { ok: true; rate: DocumentRateDetails }
  | { ok: false; error: string };

/** Largest rate accepted by hand: well above any real currency per £1. */
export const MAX_MANUAL_RATE = 1_000_000;

/**
 * The rate to put a document in `currency` dated `onDate` into the books: the
 * Bank of England spot rate published on or before that date, or `manualRate`
 * when the user entered one. Sterling is always 1. When the rate can't be
 * fetched the error tells the user they can enter one by hand.
 */
export async function documentRate(
  currency: string,
  onDate: string,
  fetchImpl: typeof fetch = fetch,
  manualRate: number | null = null,
): Promise<DocumentRateResult> {
  const code = currency.trim().toUpperCase();
  if (code === STERLING) {
    return {
      ok: true,
      rate: { currency: STERLING, fxRate: 1, fxRateDate: null, fxRateSource: null },
    };
  }
  if (!isDocumentCurrency(code)) {
    return { ok: false, error: `${code} isn't a currency documents can be issued in` };
  }
  if (manualRate != null) {
    if (!(manualRate > 0) || manualRate > MAX_MANUAL_RATE) {
      return { ok: false, error: "Enter an exchange rate above 0" };
    }
    return {
      ok: true,
      rate: { currency: code, fxRate: manualRate, fxRateDate: onDate, fxRateSource: "manual" },
    };
  }
  const observation = await resolveFxRate(code, onDate, fetchImpl).catch(() => null);
  if (!observation) {
    return {
      ok: false,
      error: `Couldn't get the Bank of England ${code} rate for ${onDate}. Enter the rate yourself, or try again later.`,
    };
  }
  return {
    ok: true,
    rate: {
      currency: code,
      fxRate: observation.foreignPerGbp,
      fxRateDate: observation.observationDate,
      fxRateSource: "boe",
    },
  };
}

/**
 * Units of `currency` per £1 on `onDate` from the Bank of England, or
 * `fallback` (usually the document's own rate) when that can't be had.
 * For estimates and charges, never for a document's booked rate.
 */
export async function rateOrFallback(
  currency: string,
  onDate: string,
  fallback: number,
): Promise<number> {
  const result = await documentRate(currency, onDate);
  return result.ok ? result.rate.fxRate : fallback;
}
