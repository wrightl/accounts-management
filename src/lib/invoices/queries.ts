import "server-only";
import { and, desc, eq, gte, inArray, lte, ne, sum } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, invoiceLineItems, invoices, payments } from "@/db/schema";
import { formatGBP } from "@/lib/money";
import {
  effectiveStatus,
  todayIsoDate,
  type InvoiceStatus,
} from "@/lib/invoices/status";

export async function listInvoices() {
  const db = getDb();
  const rows = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      status: invoices.status,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      grossPence: invoices.grossPence,
      clientId: invoices.clientId,
      clientName: clients.name,
      sentAt: invoices.sentAt,
      paidAt: invoices.paidAt,
    })
    .from(invoices)
    .innerJoin(clients, eq(invoices.clientId, clients.id))
    .orderBy(desc(invoices.createdAt));

  const today = todayIsoDate();
  return rows.map((r) => ({
    ...r,
    status: effectiveStatus(r.status as InvoiceStatus, r.dueDate, today),
    grossFormatted: formatGBP(r.grossPence),
  }));
}

export async function getInvoiceDetail(id: string) {
  const db = getDb();
  const rows = await db
    .select({
      invoice: invoices,
      client: clients,
    })
    .from(invoices)
    .innerJoin(clients, eq(invoices.clientId, clients.id))
    .where(eq(invoices.id, id))
    .limit(1);

  if (!rows[0]) return null;

  const lines = await db
    .select()
    .from(invoiceLineItems)
    .where(eq(invoiceLineItems.invoiceId, id))
    .orderBy(invoiceLineItems.position);

  const paymentRows = await db
    .select()
    .from(payments)
    .where(eq(payments.invoiceId, id))
    .orderBy(desc(payments.receivedAt));

  const paidPence = paymentRows.reduce((acc, p) => acc + p.amountPence, 0);
  const inv = rows[0].invoice;
  const today = todayIsoDate();
  const status = effectiveStatus(inv.status as InvoiceStatus, inv.dueDate, today);

  return {
    invoice: {
      ...inv,
      status,
      grossFormatted: formatGBP(inv.grossPence),
      netFormatted: formatGBP(inv.netPence),
    },
    client: rows[0].client,
    lines,
    payments: paymentRows.map((p) => ({
      ...p,
      amountFormatted: formatGBP(p.amountPence),
    })),
    paidPence,
    paidFormatted: formatGBP(paidPence),
    balancePence: Math.max(0, inv.grossPence - paidPence),
    balanceFormatted: formatGBP(Math.max(0, inv.grossPence - paidPence)),
  };
}

export interface DashboardKpis {
  outstandingPence: number;
  overduePence: number;
  invoicedThisMonthPence: number;
  outstandingFormatted: string;
  overdueFormatted: string;
  invoicedThisMonthFormatted: string;
}

export async function getDashboardKpis(): Promise<DashboardKpis> {
  const db = getDb();
  const today = todayIsoDate();
  const monthStart = `${today.slice(0, 7)}-01`;

  // Outstanding / overdue: non-draft, non-void, non-paid invoices.
  const open = await db
    .select({
      id: invoices.id,
      status: invoices.status,
      dueDate: invoices.dueDate,
      grossPence: invoices.grossPence,
    })
    .from(invoices)
    .where(and(ne(invoices.status, "draft"), ne(invoices.status, "void"), ne(invoices.status, "paid")));

  let outstandingPence = 0;
  let overduePence = 0;

  if (open.length > 0) {
    const ids = open.map((i) => i.id);
    const paidByInvoice = await db
      .select({
        invoiceId: payments.invoiceId,
        total: sum(payments.amountPence).mapWith(Number),
      })
      .from(payments)
      .where(inArray(payments.invoiceId, ids))
      .groupBy(payments.invoiceId);

    const paidMap = new Map(paidByInvoice.map((r) => [r.invoiceId, r.total ?? 0]));

    for (const inv of open) {
      const paid = paidMap.get(inv.id) ?? 0;
      const balance = Math.max(0, inv.grossPence - paid);
      if (balance === 0) continue;
      outstandingPence += balance;
      const eff = effectiveStatus(inv.status as InvoiceStatus, inv.dueDate, today);
      if (eff === "overdue") overduePence += balance;
    }
  }

  const [monthRow] = await db
    .select({
      total: sum(invoices.grossPence).mapWith(Number),
    })
    .from(invoices)
    .where(
      and(
        ne(invoices.status, "void"),
        ne(invoices.status, "draft"),
        gte(invoices.issueDate, monthStart),
        lte(invoices.issueDate, today),
      ),
    );

  const invoicedThisMonthPence = monthRow?.total ?? 0;

  return {
    outstandingPence,
    overduePence,
    invoicedThisMonthPence,
    outstandingFormatted: formatGBP(outstandingPence),
    overdueFormatted: formatGBP(overduePence),
    invoicedThisMonthFormatted: formatGBP(invoicedThisMonthPence),
  };
}

/** Sum of payments for an invoice (raw SQL helper for mutations). */
export async function sumPaymentsForInvoice(invoiceId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ total: sum(payments.amountPence).mapWith(Number) })
    .from(payments)
    .where(eq(payments.invoiceId, invoiceId));
  return row?.total ?? 0;
}
