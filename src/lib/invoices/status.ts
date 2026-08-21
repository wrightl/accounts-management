/**
 * Invoice status helpers: effective (display) status, settlement, transitions.
 */

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "void";

export function isInvoiceStatus(value: unknown): value is InvoiceStatus {
  return (
    value === "draft" ||
    value === "sent" ||
    value === "paid" ||
    value === "overdue" ||
    value === "void"
  );
}

/** Whether payments cover the invoice gross total. */
export function isFullySettled(grossPence: number, paidPence: number): boolean {
  return paidPence >= grossPence && grossPence > 0;
}

/**
 * Display status: if stored as `sent` and due date has passed, treat as overdue.
 * Paid and void are never rewritten.
 */
export function effectiveStatus(
  status: InvoiceStatus,
  dueDate: string | null | undefined,
  today: string = todayIsoDate(),
): InvoiceStatus {
  if (status === "sent" && dueDate && dueDate < today) {
    return "overdue";
  }
  return status;
}

export function todayIsoDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function defaultDueDate(issueDate: string, days = 14): string {
  const d = new Date(`${issueDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Allowed transitions for mutations (void can come from draft/sent/overdue). */
export function canTransition(
  from: InvoiceStatus,
  to: InvoiceStatus,
): boolean {
  if (from === to) return true;
  if (from === "void" || from === "paid") return false;
  if (to === "void") return from === "draft" || from === "sent" || from === "overdue";
  if (to === "sent") return from === "draft" || from === "overdue";
  if (to === "paid") return from === "sent" || from === "overdue";
  if (to === "overdue") return from === "sent";
  if (to === "draft") return false;
  return false;
}

export function canEditInvoice(status: InvoiceStatus): boolean {
  return status === "draft";
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
