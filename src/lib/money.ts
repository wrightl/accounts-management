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

/**
 * Format an expense amount in its own currency. Foreign-currency expenses
 * store minor units of `currency` (e.g. 1200 + "USD" = $12.00), not GBP pence.
 */
export function formatExpenseAmount(
  minorUnits: number,
  currency: string | null | undefined,
): string {
  const code = currency?.trim().toUpperCase();
  if (!code || code === DEFAULT_CURRENCY) return formatGBP(minorUnits);
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: code }).format(
      minorUnits / 100,
    );
  } catch {
    return `${(minorUnits / 100).toFixed(2)} ${code}`;
  }
}

/** Symbol for an expense's currency, e.g. "£", "US$", "€". */
export function expenseCurrencySymbol(currency: string | null | undefined): string {
  const code = currency?.trim().toUpperCase() || DEFAULT_CURRENCY;
  try {
    const parts = new Intl.NumberFormat("en-GB", { style: "currency", currency: code })
      .formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? code;
  } catch {
    return code;
  }
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
  /** May be fractional (up to 3 dp), e.g. 1.5 days or 7.25 hours. */
  quantity: number;
  unitPricePence: number;
  /** VAT rate as a percentage, e.g. 20 for 20%. Defaults to 0. */
  vatRate?: number;
  /** Line discount as a percentage (0–100, up to 2 dp). Defaults to 0. */
  discountPercent?: number;
}

export interface InvoiceTotals {
  netPence: number;
  vatPence: number;
  grossPence: number;
}

/**
 * Net (ex-VAT) total for a single line, after any line discount. VAT is
 * charged on this discounted amount.
 */
export function lineNetPence(line: LineItem): number {
  const discount = line.discountPercent ?? 0;
  return Math.round((line.quantity * line.unitPricePence * (100 - discount)) / 100);
}

/** VAT amount for a single line, rounded to the nearest penny. */
export function lineVatPence(line: LineItem): number {
  const rate = line.vatRate ?? 0;
  return Math.round(lineNetPence(line) * (rate / 100));
}

const quantityFormatter = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 3,
});

/** Format a line quantity without trailing zeros, e.g. 1.5 -> "1.5", 2 -> "2". */
export function formatQuantity(quantity: number): string {
  return quantityFormatter.format(quantity);
}

/** Format a line discount, e.g. 12.5 -> "12.5%". Empty for no discount. */
export function formatDiscountPercent(discountPercent: number | null | undefined): string {
  if (!discountPercent) return "";
  return `${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(discountPercent)}%`;
}

/** Whether any line carries a discount (show a Discount column only then). */
export function hasLineDiscount(lines: { discountPercent?: number | null }[]): boolean {
  return lines.some((l) => (l.discountPercent ?? 0) > 0);
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
