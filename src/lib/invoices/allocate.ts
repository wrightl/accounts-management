import "server-only";
import { eq, sql } from "drizzle-orm";
import type { Database } from "@/db";
import { companySettings } from "@/db/schema";
import {
  nextInvoiceNumber,
  parseIssueYear,
} from "@/lib/invoices/numbering";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Atomically allocate the next invoice number for the given issue date.
 * Locks (or creates) the single company_settings row inside the transaction.
 */
export async function allocateInvoiceNumber(
  tx: Tx,
  issueDate: string | null | undefined,
): Promise<string> {
  const year = parseIssueYear(issueDate);

  let rows = await tx.select().from(companySettings).limit(1);
  if (!rows[0]) {
    const [created] = await tx.insert(companySettings).values({}).returning();
    rows = [created];
  }

  const settings = rows[0];
  // Row-level lock so concurrent creates don't collide.
  await tx.execute(
    sql`select id from company_settings where id = ${settings.id} for update`,
  );

  const refreshed = await tx
    .select()
    .from(companySettings)
    .where(eq(companySettings.id, settings.id))
    .limit(1);
  const current = refreshed[0] ?? settings;

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
