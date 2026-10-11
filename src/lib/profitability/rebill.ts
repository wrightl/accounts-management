import { formatIsoDateUk } from "@/lib/dates";
import { formatGBP, penceToPounds } from "@/lib/money";

/**
 * What to charge the client for a rebillable expense. A VAT-registered
 * company reclaims the VAT it paid, so it recharges the net cost and adds VAT
 * on its own invoice. Otherwise it recharges what it paid.
 */
export function rebillPricePence(
  expense: { amountPence: number; vatPence: number },
  vatRegistered: boolean,
): number {
  return vatRegistered ? expense.amountPence - expense.vatPence : expense.amountPence;
}

/** The cost an expense adds to a project: net of reclaimable VAT, as in the P&L. */
export function expenseCostPence(expense: { amountPence: number; vatPence: number }): number {
  return expense.amountPence - expense.vatPence;
}

/** Invoice line text for a recharged expense. */
export function rebillLineDescription(expense: {
  description: string;
  spentAt: string | null;
}): string {
  const date = formatIsoDateUk(expense.spentAt);
  return date ? `${expense.description} (${date})` : expense.description;
}

export type Margin = {
  revenuePence: number;
  costPence: number;
  marginPence: number;
  /** Margin as a share of revenue, whole percent; null when there's no revenue. */
  marginPercent: number | null;
};

export function margin(revenuePence: number, costPence: number): Margin {
  const marginPence = revenuePence - costPence;
  return {
    revenuePence,
    costPence,
    marginPence,
    marginPercent: revenuePence > 0 ? Math.round((marginPence / revenuePence) * 100) : null,
  };
}

/** Picker rows for the invoice form. */
export function toRebillOptions(
  rows: Array<{
    id: string;
    clientId: string;
    description: string;
    spentAt: string | null;
    orderNumber: string | null;
    amountPence: number;
    pricePence: number;
  }>,
) {
  return rows.map((r) => ({
    id: r.id,
    clientId: r.clientId,
    lineDescription: rebillLineDescription(r),
    detail: [`Paid ${formatGBP(r.amountPence)}`, r.orderNumber ? `order ${r.orderNumber}` : null]
      .filter(Boolean)
      .join(" · "),
    pricePounds: String(penceToPounds(r.pricePence)),
    priceFormatted: formatGBP(r.pricePence),
  }));
}
