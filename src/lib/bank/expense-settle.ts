import "server-only";
import { and, eq, ne } from "drizzle-orm";
import type { Database } from "@/db";
import { invoiceLineItems, invoices } from "@/db/schema";
import { expenseOriginalAmount } from "@/lib/expenses/currency";
import { periodLockError } from "@/lib/period-lock";
import { getBooksLockedThrough } from "@/lib/period-lock-queries";
import { vatFromInclusiveGross } from "@/lib/vat";

type Db = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Expense fields to set when a bank payment settles it. A foreign-currency
 * expense also takes the sterling amount the bank paid, replacing the
 * exchange-rate estimate, unless it's recharged on an invoice or its date is
 * in a locked period.
 */
export async function expenseSettlementFields(
  db: Db,
  companyId: string,
  expense: {
    id: string;
    amountPence: number;
    vatRate: number;
    spentAt: string | null;
    detectedCurrency: string | null;
    originalAmountMinor: number | null;
  },
  bankAmountPence: number,
): Promise<{
  status: "company_paid";
  paidByUserId: null;
  amountPence?: number;
  vatPence?: number;
}> {
  const settled = { status: "company_paid" as const, paidByUserId: null };
  const sterling = Math.abs(bankAmountPence);
  if (!expenseOriginalAmount(expense) || sterling === expense.amountPence) return settled;

  if (periodLockError(await getBooksLockedThrough(companyId, db), expense.spentAt)) {
    return settled;
  }
  const [rebill] = await db
    .select({ id: invoices.id })
    .from(invoiceLineItems)
    .innerJoin(invoices, eq(invoiceLineItems.invoiceId, invoices.id))
    .where(
      and(
        eq(invoiceLineItems.expenseId, expense.id),
        eq(invoices.companyId, companyId),
        ne(invoices.status, "void"),
      ),
    )
    .limit(1);
  if (rebill) return settled;

  return {
    ...settled,
    amountPence: sterling,
    vatPence: vatFromInclusiveGross(sterling, expense.vatRate),
  };
}
