import { and, isNotNull, ne } from "drizzle-orm";
import { creditNotes, expenses, invoices, reimbursements } from "@/db/schema";
import { creditNoteCountsInAccounts } from "@/lib/invoices/accounts-scope";
import { can, type Role } from "@/lib/roles";

/**
 * What someone sees of the day-to-day records. "pack" is an accountant: the same
 * rows the accountant pack contains, read-only. These conditions are shared with
 * the pack itself so the screen and the download can't disagree.
 */
export type RecordScope = "all" | "pack";

export function recordScopeFor(role: Role | undefined | null): RecordScope {
  return can(role, "accounts:read") ? "all" : "pack";
}

export const invoiceInPack = and(ne(invoices.status, "draft"), ne(invoices.status, "void"));

export const expenseInPack = ne(expenses.status, "pending");

/** The pack lists runs by the date they were paid, so an unpaid run never appears. */
export const reimbursementInPack = isNotNull(reimbursements.paidAt);

export const creditNoteInPack = creditNoteCountsInAccounts(creditNotes.issueDate);

/** Strip the team's own notes and labels from a row: the pack exports neither. */
export function withoutTeamAnnotations<T extends { notes: string | null; labels: unknown[] }>(
  row: T,
): T {
  return { ...row, notes: null, labels: [] };
}
