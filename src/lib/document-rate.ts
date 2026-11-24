import "server-only";
import { desc, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { fxRates } from "@/db/schema";
import { resolveFxRate } from "@/lib/bank/fx";
import {
  documentTotals,
  isDocumentCurrency,
  STERLING,
  type DocumentRate,
  type DocumentTotals,
} from "@/lib/currency";
import type { LineItem } from "@/lib/money";

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

/** The columns a document stores for its currency, rate and both sets of totals. */
export type DocumentCurrencyColumns = DocumentTotals & {
  currency: string;
  fxRate: number;
  fxRateDate: string | null;
  fxRateSource: DocumentRateDetails["fxRateSource"];
};

/**
 * Price a document's lines (in its own currency) and convert them to sterling.
 * A foreign document uses the rate typed on its form, or else the Bank of
 * England rate for `onDate`, fetched again on every save so it follows the
 * date until the document can no longer be edited.
 */
export async function priceDocument(
  data: { currency: string; fxRate: number | null },
  onDate: string,
  lines: LineItem[],
  fetchImpl: typeof fetch = fetch,
): Promise<
  | { ok: true; fields: DocumentCurrencyColumns }
  | { ok: false; error: string; fieldErrors: Record<string, string> }
> {
  const foreign = data.currency.trim().toUpperCase() !== STERLING;
  const rate = await documentRate(data.currency, onDate, fetchImpl, foreign ? data.fxRate : null);
  if (!rate.ok) return { ok: false, error: rate.error, fieldErrors: { fxRate: rate.error } };
  return { ok: true, fields: documentColumns(lines, rate.rate) };
}

/** The currency columns for lines priced at an already-known rate. */
export function documentColumns(lines: LineItem[], rate: DocumentRateDetails): DocumentCurrencyColumns {
  return {
    currency: rate.currency,
    fxRate: rate.fxRate,
    fxRateDate: rate.fxRateDate,
    fxRateSource: rate.fxRateSource,
    ...documentTotals(lines, rate),
  };
}

/**
 * The latest stored Bank of England rate for each currency (sterling is 1),
 * from the cache only, for projections such as the forecast: they shouldn't
 * wait on the network. Currencies with no stored rate are left out.
 */
export async function latestStoredRates(currencies: string[]): Promise<Map<string, number>> {
  const rates = new Map<string, number>([[STERLING, 1]]);
  const foreign = [...new Set(currencies.map((c) => c.trim().toUpperCase()))].filter(
    (c) => c !== STERLING,
  );
  if (foreign.length === 0) return rates;
  const rows = await getDb()
    .selectDistinctOn([fxRates.currency], {
      currency: fxRates.currency,
      foreignPerGbp: fxRates.foreignPerGbp,
    })
    .from(fxRates)
    .where(inArray(fxRates.currency, foreign))
    .orderBy(fxRates.currency, desc(fxRates.observationDate));
  for (const r of rows) rates.set(r.currency, r.foreignPerGbp);
  return rates;
}
