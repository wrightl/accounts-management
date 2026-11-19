import "server-only";
import { and, eq } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { Tx } from "@/lib/invoices/allocate";
import {
  accountantQueries,
  accountantQueryMessages,
  auditLog,
  bankAccounts,
  bankSpendingCategories,
  bankTransactionLabels,
  bankTransactions,
  clients,
  companies,
  creditNoteLineItems,
  creditNotes,
  dataOnboarding,
  deadlineFilings,
  directorLoanEntries,
  dividendDeclarations,
  dividendPayouts,
  documentSequences,
  expenseLabels,
  expenseReceipts,
  expenses,
  inboundEmailJobs,
  invoiceLineItems,
  invoiceWriteOffs,
  invoices,
  labels,
  notifications,
  orderLineItems,
  orderPaymentMilestones,
  orders,
  payments,
  quoteDeclineReasonCategories,
  quoteLineItems,
  quotePaymentMilestones,
  quoteVersions,
  quotes,
  reconciliationMatches,
  recurringInvoices,
  reimbursementItems,
  reimbursements,
  sendJobs,
  shareholders,
  weeklyCloses,
  yearEndRuns,
} from "@/db/schema";
import type { DemoBooks } from "@/lib/demo/generate";

/** Rows per insert: well under Postgres's 65,535 bind parameters for any table here. */
const CHUNK = 400;

async function insertAll<T extends PgTable>(tx: Tx, table: T, rows: T["$inferInsert"][]) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await tx.insert(table).values(rows.slice(i, i + CHUNK));
  }
}

export type StoredReceipt = {
  expenseId: string;
  blobPath: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
};

/**
 * Insert generated books into an emptied demo company, in foreign-key order.
 * Runs inside the reset transaction, straight after the wipe.
 */
export async function writeDemoBooks(
  tx: Tx,
  companyId: string,
  books: DemoBooks,
  extra: { receipts: StoredReceipt[]; logoPath: string | null },
): Promise<void> {
  await tx
    .update(companies)
    .set({ ...books.company, logoUrl: extra.logoPath, updatedAt: new Date() })
    .where(eq(companies.id, companyId));

  await insertAll(tx, labels, books.labels);
  await insertAll(tx, bankSpendingCategories, books.spendingCategories);
  await insertAll(tx, quoteDeclineReasonCategories, books.declineReasons);
  await insertAll(tx, bankAccounts, books.bankAccounts);
  await insertAll(tx, shareholders, books.shareholders);
  await insertAll(tx, clients, books.clients);
  await insertAll(tx, recurringInvoices, books.recurringInvoices);

  // Quotes point at their orders, so orders go in first.
  await insertAll(tx, orders, books.orders);
  await insertAll(tx, orderLineItems, books.orderLineItems);
  await insertAll(tx, orderPaymentMilestones, books.orderMilestones);
  await insertAll(tx, quotes, books.quotes);
  await insertAll(tx, quoteVersions, books.quoteVersions);
  await insertAll(tx, quoteLineItems, books.quoteLineItems);
  await insertAll(tx, quotePaymentMilestones, books.quoteMilestones);

  // Inbound emails and expenses point at each other: link them after both exist.
  await insertAll(
    tx,
    inboundEmailJobs,
    books.inboundEmailJobs.map((j) => ({ ...j, expenseId: null })),
  );
  await insertAll(tx, expenses, books.expenses);
  for (const job of books.inboundEmailJobs) {
    if (!job.expenseId) continue;
    await tx
      .update(inboundEmailJobs)
      .set({ expenseId: job.expenseId })
      .where(and(eq(inboundEmailJobs.id, job.id!), eq(inboundEmailJobs.companyId, companyId)));
  }
  await insertAll(tx, expenseLabels, books.expenseLabels);
  await insertAll(
    tx,
    expenseReceipts,
    extra.receipts.map((r) => ({
      expenseId: r.expenseId,
      blobPath: r.blobPath,
      filename: r.filename,
      contentType: r.contentType,
      sizeBytes: r.sizeBytes,
    })),
  );

  await insertAll(tx, invoices, books.invoices);
  await insertAll(tx, invoiceLineItems, books.invoiceLineItems);
  await insertAll(tx, payments, books.payments);
  await insertAll(tx, creditNotes, books.creditNotes);
  await insertAll(tx, creditNoteLineItems, books.creditNoteLineItems);
  await insertAll(tx, invoiceWriteOffs, books.writeOffs);
  await insertAll(tx, sendJobs, books.sendJobs);

  await insertAll(tx, reimbursements, books.reimbursements);
  await insertAll(tx, reimbursementItems, books.reimbursementItems);

  await insertAll(tx, bankTransactions, books.bankTransactions);
  await insertAll(tx, bankTransactionLabels, books.bankTransactionLabels);
  await insertAll(tx, reconciliationMatches, books.reconciliationMatches);

  await insertAll(tx, dividendDeclarations, books.dividendDeclarations);
  await insertAll(tx, dividendPayouts, books.dividendPayouts);
  await insertAll(tx, directorLoanEntries, books.directorLoanEntries);
  await insertAll(tx, deadlineFilings, books.deadlineFilings);
  await insertAll(tx, yearEndRuns, books.yearEndRuns);
  await insertAll(tx, weeklyCloses, books.weeklyCloses);
  await insertAll(tx, accountantQueries, books.accountantQueries);
  await insertAll(tx, accountantQueryMessages, books.accountantQueryMessages);
  await insertAll(tx, notifications, books.notifications);
  await insertAll(tx, auditLog, books.auditLog);
  await insertAll(tx, dataOnboarding, [{ ...books.dataOnboarding, companyId }]);
  await insertAll(
    tx,
    documentSequences,
    books.documentSequences.map((s) => ({ companyId, ...s })),
  );
}
