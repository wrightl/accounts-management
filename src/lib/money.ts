/**
 * Money helpers. All monetary values are stored and computed as integer
 * **pence** (GBP minor units) to avoid floating-point drift. Formatting and
 * parsing convert to/from pounds only at the UI boundary.
 *
 * VAT helpers are included for future use — Dot + Dash is not currently VAT
 * registered, so invoices default to a 0% rate.
 */
export const DEFAULT_CURRENCY = "GBP";

const gbpFormatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

/** Format integer pence as a GBP string, e.g. 12345 -> "£123.45". */
export function formatGBP(pence: number): string {
  return gbpFormatter.format(pence / 100);
}

/** Parse a user-entered pounds value (e.g. "123.45" or 123.45) into pence. */
export function poundsToPence(input: string | number): number {
  const value = typeof input === "number" ? input : Number(input.replace(/[£,\s]/g, ""));
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid monetary amount: ${input}`);
  }
  return Math.round(value * 100);
}

/** Convert integer pence to a number of pounds (for display/serialisation). */
export function penceToPounds(pence: number): number {
  return pence / 100;
}

export interface LineItem {
  quantity: number;
  unitPricePence: number;
  /** VAT rate as a percentage, e.g. 20 for 20%. Defaults to 0. */
  vatRate?: number;
}

export interface InvoiceTotals {
  netPence: number;
  vatPence: number;
  grossPence: number;
}

/** Net (ex-VAT) total for a single line. */
export function lineNetPence(line: LineItem): number {
  return Math.round(line.quantity * line.unitPricePence);
}

/** VAT amount for a single line, rounded to the nearest penny. */
export function lineVatPence(line: LineItem): number {
  const rate = line.vatRate ?? 0;
  return Math.round(lineNetPence(line) * (rate / 100));
}

/** Sum a set of line items into net / VAT / gross totals. */
export function invoiceTotals(lines: LineItem[]): InvoiceTotals {
  return lines.reduce<InvoiceTotals>(
    (acc, line) => {
      const net = lineNetPence(line);
      const vat = lineVatPence(line);
      return {
        netPence: acc.netPence + net,
        vatPence: acc.vatPence + vat,
        grossPence: acc.grossPence + net + vat,
      };
    },
    { netPence: 0, vatPence: 0, grossPence: 0 },
  );
}
