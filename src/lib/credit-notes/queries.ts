import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, creditNoteLineItems, creditNotes, invoices } from "@/db/schema";
import { clientDisplayNameSql } from "@/lib/clients/sql";
import { formatGBP } from "@/lib/money";
import type { CreditNoteStatus } from "@/lib/credit-notes/status";

export async function listCreditNotes(companyId: string) {
  const db = getDb();
  const rows = await db
    .select({
      id: creditNotes.id,
      number: creditNotes.number,
      status: creditNotes.status,
      issueDate: creditNotes.issueDate,
      grossPence: creditNotes.grossPence,
      refundedPence: creditNotes.refundedPence,
      reason: creditNotes.reason,
      invoiceId: creditNotes.invoiceId,
      invoiceNumber: invoices.number,
      clientId: creditNotes.clientId,
      clientName: clientDisplayNameSql.as("client_name"),
    })
    .from(creditNotes)
    .innerJoin(invoices, eq(creditNotes.invoiceId, invoices.id))
    .innerJoin(clients, eq(creditNotes.clientId, clients.id))
    .where(eq(creditNotes.companyId, companyId))
    .orderBy(desc(creditNotes.createdAt));

  return rows.map((r) => ({
    ...r,
    status: r.status as CreditNoteStatus,
    grossFormatted: formatGBP(r.grossPence),
  }));
}

export async function getCreditNoteDetail(companyId: string, id: string) {
  const db = getDb();
  const rows = await db
    .select({ creditNote: creditNotes, invoice: invoices, client: clients })
    .from(creditNotes)
    .innerJoin(invoices, eq(creditNotes.invoiceId, invoices.id))
    .innerJoin(clients, eq(creditNotes.clientId, clients.id))
    .where(and(eq(creditNotes.id, id), eq(creditNotes.companyId, companyId)))
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
