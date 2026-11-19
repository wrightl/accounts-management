import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  companies,
  expenseReceipts,
  expenses,
  invoiceImportDrafts,
  invoiceTemplateAssets,
  invoices,
  quotes,
} from "@/db/schema";

/** Every stored file that belongs to a company: logo, PDFs, receipts and template images. */
export async function collectBlobPaths(companyId: string): Promise<string[]> {
  const db = getDb();
  const paths = new Set<string>();

  const [company] = await db
    .select({ logoUrl: companies.logoUrl })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (company?.logoUrl) paths.add(company.logoUrl);

  const invoicePdfs = await db
    .select({
      path: invoices.pdfBlobPath,
      originalPath: invoices.originalDocumentPath,
    })
    .from(invoices)
    .where(eq(invoices.companyId, companyId));
  for (const row of invoicePdfs) {
    if (row.path) paths.add(row.path);
    if (row.originalPath) paths.add(row.originalPath);
  }

  const importDrafts = await db
    .select({ path: invoiceImportDrafts.documentPath })
    .from(invoiceImportDrafts)
    .where(eq(invoiceImportDrafts.companyId, companyId));
  for (const row of importDrafts) {
    if (row.path) paths.add(row.path);
  }

  const quotePdfs = await db
    .select({ path: quotes.pdfBlobPath })
    .from(quotes)
    .where(eq(quotes.companyId, companyId));
  for (const row of quotePdfs) {
    if (row.path) paths.add(row.path);
  }

  const templateAssets = await db
    .select({ path: invoiceTemplateAssets.blobPath })
    .from(invoiceTemplateAssets)
    .where(eq(invoiceTemplateAssets.companyId, companyId));
  for (const row of templateAssets) {
    paths.add(row.path);
  }

  // Receipts get their company from the expense.
  const receipts = await db
    .select({ path: expenseReceipts.blobPath })
    .from(expenseReceipts)
    .innerJoin(expenses, eq(expenseReceipts.expenseId, expenses.id))
    .where(eq(expenses.companyId, companyId));
  for (const row of receipts) {
    if (row.path) paths.add(row.path);
  }

  return [...paths];
}
