import "server-only";
import { resolveFxRate } from "@/lib/bank/fx";
import { isDocumentCurrency, STERLING, type DocumentRate } from "@/lib/currency";

export type DocumentRateDetails = DocumentRate & {
  fxRateDate: string | null;
  fxRateSource: "boe" | null;
};

export type DocumentRateResult =
  | { ok: true; rate: DocumentRateDetails }
  | { ok: false; error: string };

/**
 * The rate to put a document in `currency` dated `onDate` into the books: the
 * Bank of England spot rate published on or before that date. Sterling is
 * always 1. When the rate can't be fetched the error tells the user they can
 * enter one by hand.
 */
export async function documentRate(
  currency: string,
  onDate: string,
  fetchImpl: typeof fetch = fetch,
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
  const observation = await resolveFxRate(code, onDate, fetchImpl);
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
