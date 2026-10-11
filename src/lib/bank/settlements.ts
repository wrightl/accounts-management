import "server-only";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/db";
import { bankAccounts, bankTransactions, payments, reconciliationMatches } from "@/db/schema";
import { formatGBP } from "@/lib/money";

export type BankSettlement = {
  bankTransactionId: string;
  bookedAt: string;
  amountFormatted: string;
  counterparty: string | null;
  bankAccountName: string;
  /** Transactions list filtered to this transaction's day and counterparty. */
  href: string;
};

export type BankSettlementTarget =
  | { invoiceId: string }
  | { expenseId: string }
  | { reimbursementId: string };

function transactionsHref(bookedAt: string, counterparty: string | null): string {
  const qs = new URLSearchParams({ period: "custom", from: bookedAt, to: bookedAt });
  if (counterparty) qs.set("q", counterparty.slice(0, 200));
  return `/transactions?${qs.toString()}`;
}

/** Confirmed bank transactions that settled an invoice, expense or reimbursement run. */
export async function listBankSettlements(
  companyId: string,
  target: BankSettlementTarget,
): Promise<BankSettlement[]> {
  const db = getDb();

  let matchCondition;
  if ("invoiceId" in target) {
    // Confirmed invoice matches may only carry the payment they created.
    const invoicePayments = db
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.invoiceId, target.invoiceId));
    matchCondition = or(
      eq(reconciliationMatches.invoiceId, target.invoiceId),
      inArray(reconciliationMatches.paymentId, invoicePayments),
    );
  } else if ("expenseId" in target) {
    matchCondition = eq(reconciliationMatches.expenseId, target.expenseId);
  } else {
    matchCondition = eq(reconciliationMatches.reimbursementId, target.reimbursementId);
  }

  const rows = await db
    .selectDistinct({
      bankTransactionId: bankTransactions.id,
      bookedAt: bankTransactions.bookedAt,
      amountPence: bankTransactions.amountPence,
      counterparty: bankTransactions.counterparty,
      description: bankTransactions.description,
      bankAccountName: bankAccounts.name,
    })
    .from(reconciliationMatches)
    .innerJoin(bankTransactions, eq(reconciliationMatches.bankTransactionId, bankTransactions.id))
    .innerJoin(bankAccounts, eq(bankTransactions.bankAccountId, bankAccounts.id))
    .where(
      and(
        eq(bankAccounts.companyId, companyId),
        eq(reconciliationMatches.confirmed, true),
        matchCondition,
      ),
    )
    .orderBy(desc(bankTransactions.bookedAt));

  return rows.map((row) => {
    const counterparty = row.counterparty ?? row.description;
    return {
      bankTransactionId: row.bankTransactionId,
      bookedAt: row.bookedAt,
      amountFormatted: formatGBP(Math.abs(row.amountPence)),
      counterparty,
      bankAccountName: row.bankAccountName,
      href: transactionsHref(row.bookedAt, counterparty),
    };
  });
}
