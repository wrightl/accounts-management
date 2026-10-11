import "server-only";
import { and, desc, eq, gte, inArray, lte, ne, sum } from "drizzle-orm";
import { getDb } from "@/db";
import {
  clients,
  creditNotes,
  invoiceLineItems,
  invoices,
  orders,
  payments,
} from "@/db/schema";
import { clientDisplayNameSql } from "@/lib/clients/sql";
import { formatGBP } from "@/lib/money";
import { creditAdjustmentsByInvoice } from "@/lib/credit-notes/adjustments";
import {
  invoiceAmountDuePence,
  invoiceRefundDuePence,
} from "@/lib/invoices/balance";
import {
  effectiveStatus,
  todayIsoDate,
  type InvoiceStatus,
} from "@/lib/invoices/status";

export async function listInvoices(companyId: string) {
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
      clientName: clientDisplayNameSql.as("client_name"),
      orderId: invoices.orderId,
      orderNumber: orders.number,
      sentAt: invoices.sentAt,
      paidAt: invoices.paidAt,
    })
    .from(invoices)
    .innerJoin(clients, eq(invoices.clientId, clients.id))
    .leftJoin(orders, eq(invoices.orderId, orders.id))
    .where(eq(invoices.companyId, companyId))
    .orderBy(desc(invoices.createdAt));

  const today = todayIsoDate();
  return rows.map((r) => ({
    ...r,
    status: effectiveStatus(r.status as InvoiceStatus, r.dueDate, today),
    grossFormatted: formatGBP(r.grossPence),
  }));
}

export async function getInvoiceDetail(companyId: string, id: string) {
  const db = getDb();
  const rows = await db
    .select({
      invoice: invoices,
      client: clients,
    })
    .from(invoices)
    .innerJoin(clients, eq(invoices.clientId, clients.id))
    .where(and(eq(invoices.id, id), eq(invoices.companyId, companyId)))
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

  const creditNoteRows = await db
    .select({
      id: creditNotes.id,
      number: creditNotes.number,
      status: creditNotes.status,
      issueDate: creditNotes.issueDate,
      reason: creditNotes.reason,
      grossPence: creditNotes.grossPence,
      refundedPence: creditNotes.refundedPence,
    })
    .from(creditNotes)
    .where(and(eq(creditNotes.invoiceId, id), eq(creditNotes.companyId, companyId)))
    .orderBy(desc(creditNotes.createdAt));

  const paidPence = paymentRows.reduce((acc, p) => acc + p.amountPence, 0);
  const issuedCredits = creditNoteRows.filter((c) => c.status === "issued");
  const creditedPence = issuedCredits.reduce((acc, c) => acc + c.grossPence, 0);
  const refundedPence = issuedCredits.reduce((acc, c) => acc + c.refundedPence, 0);
  const inv = rows[0].invoice;
  const settlement = {
    grossPence: inv.grossPence,
    paidPence,
    creditedPence,
    refundedPence,
  };
  const balancePence = invoiceAmountDuePence(settlement);
  const refundDuePence = invoiceRefundDuePence(settlement);
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
    creditNotes: creditNoteRows.map((c) => ({
      ...c,
      grossFormatted: formatGBP(c.grossPence),
    })),
    paidPence,
    paidFormatted: formatGBP(paidPence),
    creditedPence,
    creditedFormatted: formatGBP(creditedPence),
    /** Gross still available to credit (gross less issued credit notes). */
    creditablePence: Math.max(0, inv.grossPence - creditedPence),
    refundedPence,
    balancePence,
    balanceFormatted: formatGBP(balancePence),
    refundDuePence,
    refundDueFormatted: formatGBP(refundDuePence),
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

export async function getDashboardKpis(companyId: string): Promise<DashboardKpis> {
  const db = getDb();
  const today = todayIsoDate();
  const monthStart = `${today.slice(0, 7)}-01`;

  const open = await db
    .select({
      id: invoices.id,
      status: invoices.status,
      dueDate: invoices.dueDate,
      grossPence: invoices.grossPence,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.companyId, companyId),
        ne(invoices.status, "draft"),
        ne(invoices.status, "void"),
        ne(invoices.status, "paid"),
      ),
    );

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
    const credits = await creditAdjustmentsByInvoice(db, ids);

    for (const inv of open) {
      const balance = invoiceAmountDuePence({
        grossPence: inv.grossPence,
        paidPence: paidMap.get(inv.id) ?? 0,
        ...credits.get(inv.id),
      });
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
        eq(invoices.companyId, companyId),
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

/** Count open invoices with an outstanding balance past due date. */
export async function countOverdueInvoices(companyId: string): Promise<number> {
  const db = getDb();
  const today = todayIsoDate();

  const open = await db
    .select({
      id: invoices.id,
      status: invoices.status,
      dueDate: invoices.dueDate,
      grossPence: invoices.grossPence,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.companyId, companyId),
        ne(invoices.status, "draft"),
        ne(invoices.status, "void"),
        ne(invoices.status, "paid"),
      ),
    );

  if (open.length === 0) return 0;

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
  const credits = await creditAdjustmentsByInvoice(db, ids);

  let count = 0;
  for (const inv of open) {
    const balance = invoiceAmountDuePence({
      grossPence: inv.grossPence,
      paidPence: paidMap.get(inv.id) ?? 0,
      ...credits.get(inv.id),
    });
    if (balance === 0) continue;
    const eff = effectiveStatus(inv.status as InvoiceStatus, inv.dueDate, today);
    if (eff === "overdue") count += 1;
  }

  return count;
}

export type OverdueInvoiceRow = {
  id: string;
  number: string;
  clientName: string;
  dueDate: string | null;
  balanceFormatted: string;
  balancePence: number;
};

/** Open overdue invoices by balance descending. */
export async function listOverdueInvoices(
  companyId: string,
  limit = 5,
): Promise<OverdueInvoiceRow[]> {
  const db = getDb();
  const today = todayIsoDate();

  const open = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      status: invoices.status,
      dueDate: invoices.dueDate,
      grossPence: invoices.grossPence,
      clientName: clientDisplayNameSql.as("client_name"),
    })
    .from(invoices)
    .innerJoin(clients, eq(invoices.clientId, clients.id))
    .where(
      and(
        eq(invoices.companyId, companyId),
        ne(invoices.status, "draft"),
        ne(invoices.status, "void"),
        ne(invoices.status, "paid"),
      ),
    );

  if (open.length === 0) return [];

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
  const credits = await creditAdjustmentsByInvoice(db, ids);

  return open
    .map((inv) => {
      const balancePence = invoiceAmountDuePence({
        grossPence: inv.grossPence,
        paidPence: paidMap.get(inv.id) ?? 0,
        ...credits.get(inv.id),
      });
      const eff = effectiveStatus(inv.status as InvoiceStatus, inv.dueDate, today);
      return {
        id: inv.id,
        number: inv.number,
        clientName: inv.clientName,
        dueDate: inv.dueDate,
        balancePence,
        balanceFormatted: formatGBP(balancePence),
        effectiveStatus: eff,
      };
    })
    .filter((row) => row.balancePence > 0 && row.effectiveStatus === "overdue")
    .sort((a, b) => b.balancePence - a.balancePence)
    .slice(0, limit)
    .map(({ id, number, clientName, dueDate, balancePence, balanceFormatted }) => ({
      id,
      number,
      clientName,
      dueDate,
      balancePence,
      balanceFormatted,
    }));
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
