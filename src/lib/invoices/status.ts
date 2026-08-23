/**
 * Invoice status helpers: effective (display) status, settlement, transitions.
 *
 * Stored values are draft | sent | paid | void. Overdue is computed from
 * due date while the row stays `sent`. Legacy rows with stored "overdue"
 * are treated as sent.
 */

import { todayIsoDate } from "@/lib/dates";

export { todayIsoDate };

export type StoredInvoiceStatus = "draft" | "sent" | "paid" | "void";
export type InvoiceStatus = StoredInvoiceStatus | "overdue";

export function isInvoiceStatus(value: unknown): value is InvoiceStatus {
  return (
    value === "draft" ||
    value === "sent" ||
    value === "paid" ||
    value === "overdue" ||
    value === "void"
  );
}

/** Map a DB value to a stored status (legacy overdue → sent). */
export function storedStatus(status: string): StoredInvoiceStatus {
  if (status === "overdue") return "sent";
  if (status === "draft" || status === "sent" || status === "paid" || status === "void") {
    return status;
  }
  return "draft";
}

/** Whether payments cover the invoice gross total. */
export function isFullySettled(grossPence: number, paidPence: number): boolean {
  return paidPence >= grossPence && grossPence > 0;
}

/**
 * Display status: sent + past due → overdue. Paid and void are never rewritten.
 */
export function effectiveStatus(
  status: InvoiceStatus | string,
  dueDate: string | null | undefined,
  today: string = todayIsoDate(),
): InvoiceStatus {
  const stored = storedStatus(status);
  if (stored === "sent" && dueDate && dueDate < today) {
    return "overdue";
  }
  return stored;
}

export function defaultDueDate(issueDate: string, days = 14): string {
  const d = new Date(`${issueDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Allowed transitions for mutations. Overdue is display-only (same as sent). */
export function canTransition(
  from: InvoiceStatus,
  to: InvoiceStatus,
): boolean {
  const src = storedStatus(from);
  const dest = storedStatus(to);
  if (to === "overdue") return false;
  if (src === dest) return true;
  if (src === "void" || src === "paid") return false;
  if (dest === "void") return src === "draft" || src === "sent";
  if (dest === "sent") return src === "draft";
  if (dest === "paid") return src === "sent";
  if (dest === "draft") return false;
  return false;
}

export function canEditInvoice(status: InvoiceStatus): boolean {
  return storedStatus(status) === "draft";
}

export function statusLabel(status: InvoiceStatus): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "sent":
      return "Sent";
    case "paid":
      return "Paid";
    case "overdue":
      return "Overdue";
    case "void":
      return "Void";
  }
}
