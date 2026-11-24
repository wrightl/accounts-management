import { parseMoneyToMinor } from "@/lib/money";
import { vatFromInclusiveGross } from "@/lib/vat";

export const VAT_PENCE_SOURCES = ["derived", "receipt", "manual"] as const;
export type VatPenceSource = (typeof VAT_PENCE_SOURCES)[number];

export function isVatPenceSource(value: unknown): value is VatPenceSource {
  return typeof value === "string" && (VAT_PENCE_SOURCES as readonly string[]).includes(value);
}

/** The VAT to store on an expense and where it came from. */
export interface ExpenseVat {
  vatPence: number;
  vatPenceSource: VatPenceSource;
}

export class ExpenseVatError extends Error {
  readonly field = "vatPounds";
  constructor(message: string) {
    super(message);
    this.name = "ExpenseVatError";
  }
}

/** A posted VAT amount in pounds, as pence; null when blank. */
export function parseVatPounds(input: string | null | undefined): number | null {
  if (input == null || input.trim() === "") return null;
  if (!/^\s*£?\s*\d+(?:\.\d{1,2})?\s*$/.test(input)) {
    throw new ExpenseVatError("Enter the VAT as an amount in pounds, like 2.00");
  }
  return parseMoneyToMinor(input);
}

/** Whether a VAT figure differs from the one worked out from the rate by more than a penny. */
export function vatDiffersFromDerived(vatPence: number, derivedPence: number): boolean {
  return Math.abs(vatPence - derivedPence) > 1;
}

/**
 * The VAT to store for an expense.
 *
 *  - No rate (a 0% code, mileage, not VAT registered): no VAT.
 *  - Paid in another currency: worked out from the rate. A receipt's VAT in
 *    that currency isn't converted yet.
 *  - A typed figure ("manual") or one read from the receipt: kept as given,
 *    once checked to be below the amount paid.
 *  - With no source posted and an expense already stored, its choice stands:
 *    a typed or receipt figure is kept while it is below the amount paid,
 *    and a worked-out figure is worked out again.
 *  - With nothing stored yet (a new expense, or approving an emailed one whose
 *    VAT nobody has chosen), a receipt figure read earlier if there is one,
 *    else worked out from the rate.
 *
 * Throws {@link ExpenseVatError} for a typed or receipt figure that isn't a
 * sensible amount.
 */
export function resolveExpenseVat(args: {
  amountPence: number;
  vatRate: number;
  /** The currency paid in; null or GBP for sterling. */
  currency?: string | null;
  posted?: { vatPounds?: string | null; vatSource?: string | null };
  /** VAT a receipt showed, stored when it was read. */
  receiptVatPence?: number | null;
  /**
   * The expense as stored, when updating, so a post that doesn't mention VAT
   * keeps its choice. Leave it out when nobody has chosen yet (approving an
   * emailed expense), so the receipt's figure is offered.
   */
  existing?: { vatPence: number; vatPenceSource: string } | null;
}): ExpenseVat {
  const derived: ExpenseVat = {
    vatPence: vatFromInclusiveGross(args.amountPence, args.vatRate),
    vatPenceSource: "derived",
  };
  if (args.vatRate <= 0) return { vatPence: 0, vatPenceSource: "derived" };
  const currency = args.currency?.trim().toUpperCase();
  if (currency && currency !== "GBP") return derived;

  const usable = (pence: number) => pence >= 0 && pence < args.amountPence;
  const source = args.posted?.vatSource;
  if (source === "manual" || source === "receipt") {
    const pence = parseVatPounds(args.posted?.vatPounds);
    if (pence == null) return derived;
    if (!usable(pence)) throw new ExpenseVatError("The VAT must be less than the amount paid");
    return { vatPence: pence, vatPenceSource: source };
  }
  if (source === "derived") return derived;
  // No source posted (an older client, the mobile app, or the bank amount
  // being taken): keep the choice already made. A typed or receipt figure
  // stays while it still fits the amount; a worked-out one stays worked out.
  if (args.existing) {
    const kept = args.existing.vatPenceSource;
    if ((kept === "manual" || kept === "receipt") && usable(args.existing.vatPence)) {
      return { vatPence: args.existing.vatPence, vatPenceSource: kept };
    }
    return derived;
  }
  if (args.receiptVatPence != null && usable(args.receiptVatPence)) {
    return { vatPence: args.receiptVatPence, vatPenceSource: "receipt" };
  }
  return derived;
}
