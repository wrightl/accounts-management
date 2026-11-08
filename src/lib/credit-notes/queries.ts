import "server-only";
import { and, asc, count, desc, eq, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, creditNoteLineItems, creditNotes, invoices } from "@/db/schema";
import { clientDisplayNameSql } from "@/lib/clients/sql";
import { creditNoteInPack, type RecordScope } from "@/lib/accountant/record-scope";
import { type ListPaging, fetchPage } from "@/lib/list-paging";
import { formatGBP } from "@/lib/money";
import type { CreditNoteStatus } from "@/lib/credit-notes/status";
import { sortExpr, sortNumbered, sortRank, sortText } from "@/lib/sql-paging";
import type { TableSort } from "@/lib/table-sort";

export type CreditNoteSortColumn =
  | "created"
  | "number"
  | "client"
  | "invoice"
  | "status"
  | "issued"
  | "total";

function creditNoteListOrderBy({ sort, dir }: TableSort<CreditNoteSortColumn>): SQL[] {
  const by = sortExpr(dir);
  const tiebreak = [desc(creditNotes.createdAt), desc(creditNotes.id)];
  switch (sort) {
    case "number":
      return [...sortNumbered(dir, creditNotes.number), ...tiebreak];
    case "client":
      return [by(sortText(clientDisplayNameSql)), ...tiebreak];
    case "invoice":
      return [...sortNumbered(dir, invoices.number), ...tiebreak];
    case "status":
      return [by(sortRank(creditNotes.status, ["issued", "void"])), ...tiebreak];
    case "issued":
      return [by(creditNotes.issueDate), ...tiebreak];
    case "total":
      return [by(creditNotes.grossPence), ...tiebreak];
    case "created":
      return dir === "asc" ? [asc(creditNotes.createdAt), asc(creditNotes.id)] : tiebreak;
  }
}

/** One page of the credit notes list, sorted in the database. */
export async function listCreditNotePage(
  companyId: string,
  options: { scope?: RecordScope } & TableSort<CreditNoteSortColumn> & ListPaging,
) {
  const db = getDb();
  const where = and(
    eq(creditNotes.companyId, companyId),
    options.scope === "pack" ? creditNoteInPack : undefined,
  );
  const invoiceJoin = and(eq(creditNotes.invoiceId, invoices.id), eq(invoices.companyId, companyId));
  const clientJoin = and(eq(creditNotes.clientId, clients.id), eq(clients.companyId, companyId));
  const page = await fetchPage(
    options,
    async () =>
      (
        await db
          .select({ n: count() })
          .from(creditNotes)
          .innerJoin(invoices, invoiceJoin)
          .innerJoin(clients, clientJoin)
          .where(where)
      )[0]?.n ?? 0,
    ({ limit, offset }) =>
      db
        .select({
          id: creditNotes.id,
          number: creditNotes.number,
          status: creditNotes.status,
          issueDate: creditNotes.issueDate,
          grossPence: creditNotes.grossPence,
          invoiceId: creditNotes.invoiceId,
          invoiceNumber: invoices.number,
          clientName: clientDisplayNameSql.as("client_name"),
        })
        .from(creditNotes)
        .innerJoin(invoices, invoiceJoin)
        .innerJoin(clients, clientJoin)
        .where(where)
        .orderBy(...creditNoteListOrderBy(options))
        .limit(limit)
        .offset(offset),
  );
  return {
    ...page,
    rows: page.rows.map((r) => ({
      ...r,
      status: r.status as CreditNoteStatus,
      grossFormatted: formatGBP(r.grossPence),
    })),
  };
}

export async function getCreditNoteDetail(
  companyId: string,
  id: string,
  scope: RecordScope = "all",
) {
  const db = getDb();
  const rows = await db
    .select({ creditNote: creditNotes, invoice: invoices, client: clients })
    .from(creditNotes)
    .innerJoin(invoices, eq(creditNotes.invoiceId, invoices.id))
    .innerJoin(clients, eq(creditNotes.clientId, clients.id))
    .where(
      and(
        eq(creditNotes.id, id),
        eq(creditNotes.companyId, companyId),
        scope === "pack" ? creditNoteInPack : undefined,
      ),
    )
    .limit(1);
  if (!rows[0]) return null;

  const lines = await db
    .select()
    .from(creditNoteLineItems)
    .where(eq(creditNoteLineItems.creditNoteId, id))
    .orderBy(creditNoteLineItems.position);

  const { creditNote, invoice, client } = rows[0];
  return {
    creditNote: {
      ...creditNote,
      status: creditNote.status as CreditNoteStatus,
      netFormatted: formatGBP(creditNote.netPence),
      vatFormatted: formatGBP(creditNote.vatPence),
      grossFormatted: formatGBP(creditNote.grossPence),
      refundedFormatted: formatGBP(creditNote.refundedPence),
    },
    invoice: { id: invoice.id, number: invoice.number, grossPence: invoice.grossPence },
    client,
    lines,
  };
}
