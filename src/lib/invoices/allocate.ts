import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@/db";
import {
  companies,
  creditNotes,
  documentSequences,
  invoices,
  orders,
  quotes,
} from "@/db/schema";
import {
  formatInvoiceNumber,
  highestSeqByYear,
  parseIssueYear,
} from "@/lib/invoices/numbering";

export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

type DocumentKind = (typeof documentSequences.$inferSelect)["kind"];

const NUMBERED_TABLES = {
  invoice: invoices,
  quote: quotes,
  order: orders,
  credit_note: creditNotes,
} as const;

async function loadPrefix(
  tx: Tx,
  companyId: string,
  kind: DocumentKind,
): Promise<string> {
  const [settings] = await tx
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  if (!settings) {
    throw new Error(`Company not found: ${companyId}`);
  }
  switch (kind) {
    case "invoice":
      return settings.invoiceNumberPrefix || "DD";
    case "quote":
      return settings.quoteNumberPrefix || "Q";
    case "order":
      return settings.orderNumberPrefix || "O";
    case "credit_note":
      return settings.creditNoteNumberPrefix || "CN";
  }
}

/**
 * Take the next number in the series for the issue date's year. The upsert
 * holds the series row until the transaction ends, so concurrent allocations
 * queue here. Numbers that already exist, such as imported ones, are skipped.
 */
async function allocateNumber(
  tx: Tx,
  companyId: string,
  kind: DocumentKind,
  issueDate: string | null | undefined,
): Promise<string> {
  const year = parseIssueYear(issueDate);
  const prefix = await loadPrefix(tx, companyId, kind);
  const table = NUMBERED_TABLES[kind];

  for (;;) {
    const [series] = await tx
      .insert(documentSequences)
      .values({ companyId, kind, year, nextSeq: 2 })
      .onConflictDoUpdate({
        target: [
          documentSequences.companyId,
          documentSequences.kind,
          documentSequences.year,
        ],
        set: { nextSeq: sql`${documentSequences.nextSeq} + 1` },
      })
      .returning({ nextSeq: documentSequences.nextSeq });

    const number = formatInvoiceNumber(prefix, year, series.nextSeq - 1);
    const [taken] = await tx
      .select({ id: table.id })
      .from(table)
      .where(
        and(
          eq(table.companyId, companyId),
          sql`lower(${table.number}) = lower(${number})`,
        ),
      )
      .limit(1);
    if (!taken) return number;
  }
}

/** Atomically allocate the next invoice number for the given issue date. */
export function allocateInvoiceNumber(
  tx: Tx,
  companyId: string,
  issueDate: string | null | undefined,
): Promise<string> {
  return allocateNumber(tx, companyId, "invoice", issueDate);
}

/** Atomically allocate the next quote number for the given issue date. */
export function allocateQuoteNumber(
  tx: Tx,
  companyId: string,
  issueDate: string | null | undefined,
): Promise<string> {
  return allocateNumber(tx, companyId, "quote", issueDate);
}

/** Atomically allocate the next order number for the given issue date. */
export function allocateOrderNumber(
  tx: Tx,
  companyId: string,
  issueDate: string | null | undefined,
): Promise<string> {
  return allocateNumber(tx, companyId, "order", issueDate);
}

/** Atomically allocate the next credit note number for the given issue date. */
export function allocateCreditNoteNumber(
  tx: Tx,
  companyId: string,
  issueDate: string | null | undefined,
): Promise<string> {
  return allocateNumber(tx, companyId, "credit_note", issueDate);
}

/**
 * Move each year's invoice series past imported numbers in the company's own
 * format. A series never moves backwards, and other formats leave it alone.
 */
export async function advanceInvoiceSequences(
  tx: Tx,
  companyId: string,
  importedNumbers: string[],
): Promise<void> {
  const prefix = await loadPrefix(tx, companyId, "invoice");
  for (const [year, seq] of highestSeqByYear(prefix, importedNumbers)) {
    await tx
      .insert(documentSequences)
      .values({ companyId, kind: "invoice", year, nextSeq: seq + 1 })
      .onConflictDoUpdate({
        target: [
          documentSequences.companyId,
          documentSequences.kind,
          documentSequences.year,
        ],
        set: {
          nextSeq: sql`greatest(${documentSequences.nextSeq}, ${seq + 1})`,
        },
      });
  }
}
