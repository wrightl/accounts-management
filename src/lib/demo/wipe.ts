import "server-only";
import { eq } from "drizzle-orm";
import type { Tx } from "@/lib/invoices/allocate";
import {
  accountantQueries,
  assistantDraftRequests,
  auditLog,
  bankAccounts,
  bankSpendingCategories,
  clients,
  companies,
  creditNotes,
  dataOnboarding,
  deadlineFilings,
  directorLoanEntries,
  dividendDeclarations,
  documentSequences,
  expenses,
  inboundEmailJobs,
  incomeCategories,
  invoiceImportBatches,
  invoicePdfReads,
  invoiceTemplateAssets,
  invoiceTemplates,
  invoiceWriteOffs,
  invoices,
  labels,
  notifications,
  orders,
  quoteDeclineReasonCategories,
  quotes,
  recordCounters,
  recurringInvoices,
  reimbursements,
  sendJobs,
  shareholders,
  weeklyCloses,
  yearEndResponses,
  yearEndRuns,
} from "@/db/schema";

export class NotDemoCompanyError extends Error {
  constructor() {
    super("Refusing to touch a company that isn't a demo company");
    this.name = "NotDemoCompanyError";
  }
}

/** Throws unless the company exists and is flagged as a demo. Locks its row for the transaction. */
export async function assertDemoCompany(tx: Tx, companyId: string): Promise<void> {
  const [row] = await tx
    .select({ isDemo: companies.isDemo })
    .from(companies)
    .where(eq(companies.id, companyId))
    .for("update")
    .limit(1);
  if (!row?.isDemo) throw new NotDemoCompanyError();
}

/**
 * Delete everything a demo company has recorded, keeping the company row, its
 * members and its billing. Tables are cleared in an order that respects the
 * foreign keys that restrict deletes (credit notes and write-offs before
 * invoices, invoices before clients, reimbursements before expenses); child
 * rows go with their parents by cascade. Refuses any company that isn't a demo.
 */
export async function wipeDemoCompanyData(tx: Tx, companyId: string): Promise<void> {
  await assertDemoCompany(tx, companyId);

  // Each table below has a company_id column; children cascade from these.
  const ordered = [
    creditNotes,
    invoiceWriteOffs,
    reimbursements,
    sendJobs,
    invoiceImportBatches,
    bankAccounts,
    invoices,
    recurringInvoices,
    orders,
    quotes,
    expenses,
    inboundEmailJobs,
    clients,
    dividendDeclarations,
    shareholders,
    directorLoanEntries,
    labels,
    bankSpendingCategories,
    incomeCategories,
    quoteDeclineReasonCategories,
    deadlineFilings,
    weeklyCloses,
    yearEndRuns,
    yearEndResponses,
    accountantQueries,
    notifications,
    auditLog,
    documentSequences,
    recordCounters,
    invoicePdfReads,
    dataOnboarding,
    assistantDraftRequests,
  ] as const;
  for (const table of ordered) {
    await tx.delete(table).where(eq(table.companyId, companyId));
  }

  // Templates are referenced from the company row, so detach them first.
  await tx
    .update(companies)
    .set({
      invoiceCustomTemplateId: null,
      quoteCustomTemplateId: null,
      creditNoteCustomTemplateId: null,
    })
    .where(eq(companies.id, companyId));
  await tx.delete(invoiceTemplateAssets).where(eq(invoiceTemplateAssets.companyId, companyId));
  await tx.delete(invoiceTemplates).where(eq(invoiceTemplates.companyId, companyId));
}
