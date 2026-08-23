import "server-only";
import { eq, sql } from "drizzle-orm";
import type { Database } from "@/db";
import { companySettings } from "@/db/schema";
import {
  nextInvoiceNumber,
  nextQuoteNumber,
  parseIssueYear,
} from "@/lib/invoices/numbering";

export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

async function lockCompanySettings(tx: Tx) {
  let rows = await tx.select().from(companySettings).limit(1);
  if (!rows[0]) {
    try {
      const [created] = await tx.insert(companySettings).values({}).returning();
      rows = [created];
    } catch {
      rows = await tx.select().from(companySettings).limit(1);
    }
  }
  const settings = rows[0];
  if (!settings) {
    throw new Error("company_settings row is missing");
  }

  await tx.execute(
    sql`select id from company_settings where id = ${settings.id} for update`,
  );

  const refreshed = await tx
    .select()
    .from(companySettings)
    .where(eq(companySettings.id, settings.id))
    .limit(1);
  return refreshed[0] ?? settings;
}

/**
 * Atomically allocate the next invoice number for the given issue date.
 * Locks (or creates) the single company_settings row inside the transaction.
 */
export async function allocateInvoiceNumber(
  tx: Tx,
  issueDate: string | null | undefined,
): Promise<string> {
  const year = parseIssueYear(issueDate);
  const current = await lockCompanySettings(tx);
  const allocated = nextInvoiceNumber(
    {
      invoiceNumberPrefix: current.invoiceNumberPrefix,
      invoiceNextSeq: current.invoiceNextSeq,
      invoiceSeqYear: current.invoiceSeqYear,
    },
    year,
  );

  await tx
    .update(companySettings)
    .set({
      invoiceNextSeq: allocated.nextSeq,
      invoiceSeqYear: allocated.seqYear,
      updatedAt: new Date(),
    })
    .where(eq(companySettings.id, current.id));

  return allocated.number;
}

/** Atomically allocate the next quote number (Q-YYYY-NNNN) under the same lock. */
export async function allocateQuoteNumber(
  tx: Tx,
  issueDate: string | null | undefined,
): Promise<string> {
  const year = parseIssueYear(issueDate);
  const current = await lockCompanySettings(tx);
  const allocated = nextQuoteNumber(
    {
      quoteNumberPrefix: current.quoteNumberPrefix,
      quoteNextSeq: current.quoteNextSeq,
      quoteSeqYear: current.quoteSeqYear,
    },
    year,
  );

  await tx
    .update(companySettings)
    .set({
      quoteNextSeq: allocated.nextSeq,
      quoteSeqYear: allocated.seqYear,
      updatedAt: new Date(),
    })
    .where(eq(companySettings.id, current.id));

  return allocated.number;
}
