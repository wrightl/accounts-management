/**
 * Invoice balance after payments, credit notes and refunds.
 *
 *   balance = gross − credited − paid + refunded
 *
 * Positive: the client still owes that much. Negative: the invoice was paid
 * and then credited, so a refund is due to the client.
 */
export interface InvoiceSettlement {
  grossPence: number;
  paidPence: number;
  /** Gross of issued (non-void) credit notes against the invoice. */
  creditedPence?: number;
  /** Money returned to the client against those credit notes. */
  refundedPence?: number;
}

export function invoiceBalancePence(s: InvoiceSettlement): number {
  return s.grossPence - (s.creditedPence ?? 0) - s.paidPence + (s.refundedPence ?? 0);
}

/** What the client still owes (never negative). */
export function invoiceAmountDuePence(s: InvoiceSettlement): number {
  return Math.max(0, invoiceBalancePence(s));
}

/** What is owed back to the client after a credit on a paid invoice. */
export function invoiceRefundDuePence(s: InvoiceSettlement): number {
  return Math.max(0, -invoiceBalancePence(s));
}

/** Whether payments and credits cover the invoice (it can be marked paid). */
export function isInvoiceSettled(s: InvoiceSettlement): boolean {
  return s.grossPence > 0 && invoiceBalancePence(s) <= 0;
}
