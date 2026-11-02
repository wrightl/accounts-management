import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  bankAccounts,
  bankTransactions,
  creditNotes,
  dividendDeclarations,
  expenses,
  invoices,
  recurringInvoices,
  reimbursements,
  shareholders,
} from "@/db/schema";
import {
  creditNoteInPack,
  expenseInPack,
  invoiceInPack,
  reimbursementInPack,
  type RecordScope,
} from "@/lib/accountant/record-scope";
import { formatGBP } from "@/lib/money";
import type { QueryRecordKind } from "./status";

export type QueryRecord = { label: string; href: string };

/**
 * The record a query points at, or null if it doesn't exist, belongs to another
 * company or is outside the viewer's scope. The label is read from here rather
 * than taken from the browser.
 */
export async function findQueryRecord(
  companyId: string,
  kind: QueryRecordKind,
  id: string,
  scope: RecordScope,
): Promise<QueryRecord | null> {
  const db = getDb();
  const inPack = scope === "pack";
  switch (kind) {
    case "invoice": {
      const [row] = await db
        .select({ number: invoices.number })
        .from(invoices)
        .where(
          and(
            eq(invoices.id, id),
            eq(invoices.companyId, companyId),
            inPack ? invoiceInPack : undefined,
          ),
        )
        .limit(1);
      return row ? { label: `Invoice ${row.number}`, href: `/invoices/${id}` } : null;
    }
    case "credit_note": {
      const [row] = await db
        .select({ number: creditNotes.number })
        .from(creditNotes)
        .where(
          and(
            eq(creditNotes.id, id),
            eq(creditNotes.companyId, companyId),
            inPack ? creditNoteInPack : undefined,
          ),
        )
        .limit(1);
      return row ? { label: `Credit note ${row.number}`, href: `/credit-notes/${id}` } : null;
    }
    case "expense": {
      const [row] = await db
        .select({ description: expenses.description })
        .from(expenses)
        .where(
          and(
            eq(expenses.id, id),
            eq(expenses.companyId, companyId),
            inPack ? expenseInPack : undefined,
          ),
        )
        .limit(1);
      return row ? { label: `Expense: ${row.description}`, href: `/expenses/${id}` } : null;
    }
    case "reimbursement": {
      const [row] = await db
        .select({ reference: reimbursements.reference, totalPence: reimbursements.totalPence })
        .from(reimbursements)
        .where(
          and(
            eq(reimbursements.id, id),
            eq(reimbursements.companyId, companyId),
            inPack ? reimbursementInPack : undefined,
          ),
        )
        .limit(1);
      return row
        ? {
            label: `Reimbursement ${row.reference ?? formatGBP(row.totalPence)}`,
            href: `/reimbursements/${id}`,
          }
        : null;
    }
    case "bank_transaction": {
      // Bank rows have no company of their own; it comes from their account.
      const [row] = await db
        .select({
          bookedAt: bankTransactions.bookedAt,
          amountPence: bankTransactions.amountPence,
          counterparty: bankTransactions.counterparty,
          reference: bankTransactions.reference,
          description: bankTransactions.description,
        })
        .from(bankTransactions)
        .innerJoin(bankAccounts, eq(bankTransactions.bankAccountId, bankAccounts.id))
        .where(and(eq(bankTransactions.id, id), eq(bankAccounts.companyId, companyId)))
        .limit(1);
      if (!row) return null;
      const name = row.counterparty ?? row.description ?? row.reference;
      const search = new URLSearchParams(name ? { q: name } : {}).toString();
      return {
        label: `Bank ${row.bookedAt}: ${name ?? "transaction"} ${formatGBP(row.amountPence)}`,
        href: search ? `/transactions?${search}` : "/transactions",
      };
    }
    case "dividend_declaration": {
      const [row] = await db
        .select({ declaredAt: dividendDeclarations.declaredAt })
        .from(dividendDeclarations)
        .where(and(eq(dividendDeclarations.id, id), eq(dividendDeclarations.companyId, companyId)))
        .limit(1);
      return row
        ? {
            label: `Dividend declared ${row.declaredAt}`,
            href: `/dividends?from=${row.declaredAt}&to=${row.declaredAt}`,
          }
        : null;
    }
    case "shareholder": {
      const [row] = await db
        .select({ name: shareholders.name })
        .from(shareholders)
        .where(and(eq(shareholders.id, id), eq(shareholders.companyId, companyId)))
        .limit(1);
      return row ? { label: `Shareholder ${row.name}`, href: `/shareholders/${id}` } : null;
    }
    case "recurring_invoice": {
      const [row] = await db
        .select({ name: recurringInvoices.name })
        .from(recurringInvoices)
        .where(and(eq(recurringInvoices.id, id), eq(recurringInvoices.companyId, companyId)))
        .limit(1);
      return row ? { label: `Recurring ${row.name}`, href: `/recurring-invoices/${id}` } : null;
    }
  }
}
