import "server-only";
import { eq, sql } from "drizzle-orm";
import type { Database } from "@/db";
import { companies } from "@/db/schema";
import {
  nextInvoiceNumber,
  nextOrderNumber,
  nextQuoteNumber,
  parseIssueYear,
} from "@/lib/invoices/numbering";

export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

async function lockCompany(tx: Tx, companyId: string) {
  await tx.execute(
    sql`select id from companies where id = ${companyId} for update`,
  );

  const [settings] = await tx
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  if (!settings) {
    throw new Error(`Company not found: ${companyId}`);
  }
  return settings;
}

/**
 * Atomically allocate the next invoice number for the given issue date.
 * Locks the company row inside the transaction.
 */
export async function allocateInvoiceNumber(
  tx: Tx,
  companyId: string,
  issueDate: string | null | undefined,
): Promise<string> {
  const year = parseIssueYear(issueDate);
  const current = await lockCompany(tx, companyId);
  const allocated = nextInvoiceNumber(
    {
      invoiceNumberPrefix: current.invoiceNumberPrefix,
      invoiceNextSeq: current.invoiceNextSeq,
      invoiceSeqYear: current.invoiceSeqYear,
    },
    year,
  );

  await tx
    .update(companies)
    .set({
      invoiceNextSeq: allocated.nextSeq,
      invoiceSeqYear: allocated.seqYear,
      updatedAt: new Date(),
    })
    .where(eq(companies.id, current.id));

  return allocated.number;
}

/** Atomically allocate the next quote number (Q-YYYY-NNNN) under the same lock. */
export async function allocateQuoteNumber(
  tx: Tx,
  companyId: string,
  issueDate: string | null | undefined,
): Promise<string> {
  const year = parseIssueYear(issueDate);
  const current = await lockCompany(tx, companyId);
  const allocated = nextQuoteNumber(
    {
      quoteNumberPrefix: current.quoteNumberPrefix,
      quoteNextSeq: current.quoteNextSeq,
      quoteSeqYear: current.quoteSeqYear,
    },
    year,
  );

  await tx
    .update(companies)
    .set({
      quoteNextSeq: allocated.nextSeq,
      quoteSeqYear: allocated.seqYear,
      updatedAt: new Date(),
    })
    .where(eq(companies.id, current.id));

  return allocated.number;
}

/** Atomically allocate the next order number under the same lock. */
export async function allocateOrderNumber(
  tx: Tx,
  companyId: string,
  issueDate: string | null | undefined,
): Promise<string> {
  const year = parseIssueYear(issueDate);
  const current = await lockCompany(tx, companyId);
  const allocated = nextOrderNumber(
    {
      orderNumberPrefix: current.orderNumberPrefix,
      orderNextSeq: current.orderNextSeq,
      orderSeqYear: current.orderSeqYear,
    },
    year,
  );

  await tx
    .update(companies)
    .set({
      orderNextSeq: allocated.nextSeq,
      orderSeqYear: allocated.seqYear,
      updatedAt: new Date(),
    })
    .where(eq(companies.id, current.id));

  return allocated.number;
}
