/**
 * Document currencies. Invoices, credit notes, quotes and orders are written
 * in a document currency (what the client sees and owes) and also carry
 * sterling book values for the accounts, converted at the document's rate.
 * Safe to import from client components.
 */
import { formatIsoDateLong } from "@/lib/dates";
import { BOE_SERIES_BY_CURRENCY } from "@/lib/expenses/currency";
import { invoiceTotals, type InvoiceTotals, type LineItem } from "@/lib/money";

export const STERLING = "GBP";

/**
 * Currencies a document can be issued in: sterling plus every currency with a
 * Bank of England daily rate, except zero-decimal ones (JPY), which the
 * two-decimal money helpers can't represent.
 */
export const DOCUMENT_CURRENCIES: readonly string[] = [
  STERLING,
  ...Object.keys(BOE_SERIES_BY_CURRENCY).filter((code) => code !== "JPY"),
];

export function isDocumentCurrency(code: string | null | undefined): boolean {
  return !!code && DOCUMENT_CURRENCIES.includes(code.trim().toUpperCase());
}

export function isForeignDocumentCurrency(code: string | null | undefined): boolean {
  return !!code && code.trim().toUpperCase() !== STERLING;
}

/** A document's currency and its rate in units of that currency per £1. */
export interface DocumentRate {
  currency: string;
  fxRate: number;
}

export const STERLING_RATE: DocumentRate = { currency: STERLING, fxRate: 1 };

export interface DocumentTotals extends InvoiceTotals {
  netMinor: number;
  vatMinor: number;
  grossMinor: number;
}

/**
 * The rate a foreign document was converted at, as HMRC asks for on a VAT
 * invoice in another currency: "1 GBP = 1.2731 USD (Bank of England, 20 November 2026)".
 */
export function describeDocumentRate(doc: {
  currency: string;
  fxRate: number;
  fxRateDate: string | null;
  fxRateSource: "boe" | "manual" | null;
}): string {
  const source = doc.fxRateSource === "boe" ? "Bank of England" : "agreed rate";
  const dated = doc.fxRateDate ? `, ${formatIsoDateLong(doc.fxRateDate)}` : "";
  return `1 GBP = ${doc.fxRate} ${doc.currency} (${source}${dated})`;
}

/** Sterling pence for an amount in a document currency at `fxRate` per £1. */
export function toSterlingPence(minor: number, fxRate: number): number {
  if (!(fxRate > 0) || !Number.isFinite(fxRate)) {
    throw new Error(`Invalid FX rate: ${fxRate}`);
  }
  if (fxRate === 1) return minor;
  return Math.round(minor / fxRate);
}

/**
 * Sterling book totals for document-currency totals. Net and VAT are each
 * converted and gross is their sum, so the books never differ by a penny.
 */
export function convertTotals(
  totals: { netMinor: number; vatMinor: number },
  rate: DocumentRate,
): DocumentTotals {
  const netPence = toSterlingPence(totals.netMinor, rate.fxRate);
  const vatPence = toSterlingPence(totals.vatMinor, rate.fxRate);
  return {
    netMinor: totals.netMinor,
    vatMinor: totals.vatMinor,
    grossMinor: totals.netMinor + totals.vatMinor,
    netPence,
    vatPence,
    grossPence: netPence + vatPence,
  };
}

/** Totals for line items priced in the document currency, in both currencies. */
export function documentTotals(lines: LineItem[], rate: DocumentRate): DocumentTotals {
  const t = invoiceTotals(lines);
  return convertTotals({ netMinor: t.netPence, vatMinor: t.vatPence }, rate);
}

/** Both sets of totals for a sterling document whose totals are already known. */
export function sterlingTotals(t: InvoiceTotals): DocumentTotals {
  return {
    netPence: t.netPence,
    vatPence: t.vatPence,
    grossPence: t.grossPence,
    netMinor: t.netPence,
    vatMinor: t.vatPence,
    grossMinor: t.grossPence,
  };
}
