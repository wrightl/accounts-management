/**
 * Invoice balance after payments, credit notes and refunds.
 *
 *   balance = gross − credited − written off − paid + refunded
 *
 * Positive: the client still owes that much. Negative: the invoice was paid
 * and then credited, so a refund is due to the client.
 *
 * The helpers work in one unit at a time. Build the settlement with
 * `settlementMinor` for what the client owes in the invoice's currency
 * (settling, amounts due, pay links), or `settlementPence` for sterling book
 * values (reports, debtor totals). For GBP invoices they are the same.
 */
export interface InvoiceSettlement {
  gross: number;
  paid: number;
  /** Gross of issued (non-void) credit notes against the invoice. */
  credited?: number;
  /** Money returned to the client against those credit notes. */
  refunded?: number;
  /** Shortfall written off as bank charges, bad debt or exchange difference. */
  writtenOff?: number;
}

/** Credit-note, refund and write-off totals for an invoice, in both units. */
export type CreditAdjustment = {
  creditedPence: number;
  refundedPence: number;
  /** Sterling written off, including signed exchange differences. */
  writtenOffPence: number;
  creditedMinor: number;
  refundedMinor: number;
  /** Written off in the invoice's currency (exchange differences are 0 here). */
  writtenOffMinor: number;
};

export const NO_CREDIT_ADJUSTMENT: CreditAdjustment = {
  creditedPence: 0,
  refundedPence: 0,
  writtenOffPence: 0,
  creditedMinor: 0,
  refundedMinor: 0,
  writtenOffMinor: 0,
};

/** Settlement in the invoice's currency: what the client owes. */
export function settlementMinor(
  inv: { grossMinor: number },
  paidMinor: number,
  adj: Partial<CreditAdjustment> = {},
): InvoiceSettlement {
  return {
    gross: inv.grossMinor,
    paid: paidMinor,
    credited: adj.creditedMinor ?? 0,
    refunded: adj.refundedMinor ?? 0,
    writtenOff: adj.writtenOffMinor ?? 0,
  };
}

/** Settlement in sterling book values: the debtor in the accounts. */
export function settlementPence(
  inv: { grossPence: number },
  paidPence: number,
  adj: Partial<CreditAdjustment> = {},
): InvoiceSettlement {
  return {
    gross: inv.grossPence,
    paid: paidPence,
    credited: adj.creditedPence ?? 0,
    refunded: adj.refundedPence ?? 0,
    writtenOff: adj.writtenOffPence ?? 0,
  };
}

export function invoiceBalance(s: InvoiceSettlement): number {
  return s.gross - (s.credited ?? 0) - (s.writtenOff ?? 0) - s.paid + (s.refunded ?? 0);
}

/** What the client still owes (never negative). */
export function invoiceAmountDue(s: InvoiceSettlement): number {
  return Math.max(0, invoiceBalance(s));
}

/** What is owed back to the client after a credit on a paid invoice. */
export function invoiceRefundDue(s: InvoiceSettlement): number {
  return Math.max(0, -invoiceBalance(s));
}

/**
 * Whether payments and credits cover the invoice (it can be marked paid).
 * Pass a `settlementMinor`: a foreign invoice is settled in its own currency.
 */
export function isInvoiceSettled(s: InvoiceSettlement): boolean {
  return s.gross > 0 && invoiceBalance(s) <= 0;
}
