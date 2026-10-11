import "server-only";
import { and, desc, eq, gte, inArray, isNotNull, lte, ne, notInArray, sql, sum, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import {
  clients,
  companies,
  creditNotes,
  expenses,
  invoiceLineItems,
  invoices,
  orders,
} from "@/db/schema";
import { clientDisplayNameSql } from "@/lib/clients/sql";
import { lineNetPence } from "@/lib/money";
import { margin, rebillPricePence, type Margin } from "@/lib/profitability/rebill";

/** Invoices that count as revenue: issued, not voided. */
const BOOKED = notInArray(invoices.status, ["draft", "void"]);

/** No line on a live invoice recharges this expense (other than `invoiceId`). */
function notRebilled(exceptInvoiceId?: string | null): SQL {
  return sql`not exists (
    select 1 from ${invoiceLineItems} li
    join ${invoices} i on i.id = li.invoice_id
    where li.expense_id = ${expenses.id} and i.status <> 'void'
    ${exceptInvoiceId ? sql`and i.id <> ${exceptInvoiceId}` : sql``}
  )`;
}

async function isVatRegistered(companyId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ vatRegistered: companies.vatRegistered })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  return row?.vatRegistered ?? false;
}

/** The live invoice that recharges this expense, if any. */
export async function getExpenseRebill(companyId: string, expenseId: string) {
  const [row] = await getDb()
    .select({ invoiceId: invoices.id, number: invoices.number, status: invoices.status })
    .from(invoiceLineItems)
    .innerJoin(invoices, eq(invoiceLineItems.invoiceId, invoices.id))
    .where(
      and(
        eq(invoiceLineItems.expenseId, expenseId),
        eq(invoices.companyId, companyId),
        ne(invoices.status, "void"),
      ),
    )
    .limit(1);
  return row ?? null;
}

export type RebillableExpense = {
  id: string;
  description: string;
  spentAt: string | null;
  amountPence: number;
  vatPence: number;
  clientId: string;
  orderId: string | null;
  orderNumber: string | null;
  /** What to charge the client, before any VAT on the invoice. */
  pricePence: number;
};

/**
 * Rebillable expenses not yet on a live invoice. `invoiceId` also includes
 * the ones already on that invoice, so an edit can keep them.
 */
export async function listRebillableExpenses(
  companyId: string,
  opts: { clientId?: string; invoiceId?: string | null } = {},
): Promise<RebillableExpense[]> {
  const [vatRegistered, rows] = await Promise.all([
    isVatRegistered(companyId),
    getDb()
      .select({
        id: expenses.id,
        description: expenses.description,
        spentAt: expenses.spentAt,
        amountPence: expenses.amountPence,
        vatPence: expenses.vatPence,
        clientId: expenses.clientId,
        orderId: expenses.orderId,
        orderNumber: orders.number,
      })
      .from(expenses)
      .leftJoin(orders, eq(expenses.orderId, orders.id))
      .where(
        and(
          eq(expenses.companyId, companyId),
          eq(expenses.billable, true),
          isNotNull(expenses.clientId),
          ne(expenses.status, "pending"),
          opts.clientId ? eq(expenses.clientId, opts.clientId) : undefined,
          notRebilled(opts.invoiceId),
        ),
      )
      .orderBy(expenses.spentAt, expenses.createdAt),
  ]);
  return rows.map((r) => ({
    ...r,
    clientId: r.clientId!,
    pricePence: rebillPricePence(r, vatRegistered),
  }));
}

/**
 * Check the expenses an invoice recharges: each belongs to the invoice's
 * client, is rebillable, and isn't on another live invoice.
 */
export async function checkRebillExpenses(
  companyId: string,
  clientId: string,
  expenseIds: string[],
  invoiceId: string | null,
): Promise<string | null> {
  if (expenseIds.length === 0) return null;
  if (new Set(expenseIds).size !== expenseIds.length) {
    return "The same expense is on this invoice twice.";
  }
  const available = new Set(
    (await listRebillableExpenses(companyId, { clientId, invoiceId })).map((e) => e.id),
  );
  if (expenseIds.some((id) => !available.has(id))) {
    return "A recharged expense is already on another invoice or belongs to a different client. Reload the page and try again.";
  }
  return null;
}

export type ProjectExpense = {
  id: string;
  description: string;
  spentAt: string | null;
  costPence: number;
  billable: boolean;
  orderId: string | null;
  orderNumber: string | null;
  rebilledOn: { invoiceId: string; number: string } | null;
};

/** Expenses tagged to an order or a client, with where each was recharged. */
export async function listProjectExpenses(
  companyId: string,
  filter: { orderId: string } | { clientId: string },
): Promise<ProjectExpense[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: expenses.id,
      description: expenses.description,
      spentAt: expenses.spentAt,
      costPence: sql<number>`${expenses.amountPence} - ${expenses.vatPence}`.mapWith(Number),
      billable: expenses.billable,
      orderId: expenses.orderId,
      orderNumber: orders.number,
    })
    .from(expenses)
    .leftJoin(orders, eq(expenses.orderId, orders.id))
    .where(
      and(
        eq(expenses.companyId, companyId),
        ne(expenses.status, "pending"),
        "orderId" in filter
          ? eq(expenses.orderId, filter.orderId)
          : eq(expenses.clientId, filter.clientId),
      ),
    )
    .orderBy(desc(expenses.spentAt), desc(expenses.createdAt))
    .limit(200);
  if (rows.length === 0) return [];

  const lines = await db
    .select({
      expenseId: invoiceLineItems.expenseId,
      invoiceId: invoices.id,
      number: invoices.number,
    })
    .from(invoiceLineItems)
    .innerJoin(invoices, eq(invoiceLineItems.invoiceId, invoices.id))
    .where(
      and(
        eq(invoices.companyId, companyId),
        ne(invoices.status, "void"),
        inArray(
          invoiceLineItems.expenseId,
          rows.map((r) => r.id),
        ),
      ),
    );
  const rebilled = new Map(lines.map((l) => [l.expenseId!, { invoiceId: l.invoiceId, number: l.number }]));
  return rows.map((r) => ({ ...r, rebilledOn: rebilled.get(r.id) ?? null }));
}

export type OrderProfitability = {
  orderId: string;
  number: string;
  status: string;
  clientId: string;
  clientName: string;
  /** The order's value, net of VAT. */
  quotedPence: number;
  /** Net invoiced against the order, less credit notes. */
  invoicedPence: number;
  /** Expenses tagged to the order but recharged on other invoices. */
  rebilledElsewherePence: number;
  /** Rebillable costs not on an invoice yet. */
  unbilledRebillablePence: number;
  /** Quoted work and rebillable costs still to invoice. */
  stillToInvoicePence: number;
  /** So far: revenue booked against costs recorded. */
  current: Margin;
  /** Once everything quoted and rebillable is invoiced, with the costs so far. */
  projected: Margin;
};

/** Margin for each order (or the given ones). Revenue is net of VAT. */
export async function listOrderProfitability(
  companyId: string,
  orderIds?: string[],
): Promise<OrderProfitability[]> {
  if (orderIds && orderIds.length === 0) return [];
  const db = getDb();
  const onlyOrders = orderIds ? inArray(orders.id, orderIds) : undefined;
  const [orderRows, invoiced, credited, rebillLines, costs, rebillable] = await Promise.all([
    db
      .select({
        id: orders.id,
        number: orders.number,
        status: orders.status,
        netPence: orders.netPence,
        clientId: orders.clientId,
        clientName: clientDisplayNameSql.as("client_name"),
      })
      .from(orders)
      .innerJoin(clients, eq(orders.clientId, clients.id))
      .where(and(eq(orders.companyId, companyId), onlyOrders))
      .orderBy(desc(orders.createdAt)),
    db
      .select({ orderId: invoices.orderId, net: sum(invoices.netPence).mapWith(Number) })
      .from(invoices)
      .where(and(eq(invoices.companyId, companyId), isNotNull(invoices.orderId), BOOKED))
      .groupBy(invoices.orderId),
    db
      .select({ orderId: invoices.orderId, net: sum(creditNotes.netPence).mapWith(Number) })
      .from(creditNotes)
      .innerJoin(invoices, eq(creditNotes.invoiceId, invoices.id))
      .where(
        and(
          eq(creditNotes.companyId, companyId),
          eq(creditNotes.status, "issued"),
          isNotNull(invoices.orderId),
        ),
      )
      .groupBy(invoices.orderId),
    db
      .select({
        invoiceOrderId: invoices.orderId,
        expenseOrderId: expenses.orderId,
        quantity: invoiceLineItems.quantity,
        unitPricePence: invoiceLineItems.unitPricePence,
        discountPercent: invoiceLineItems.discountPercent,
      })
      .from(invoiceLineItems)
      .innerJoin(invoices, eq(invoiceLineItems.invoiceId, invoices.id))
      .innerJoin(expenses, eq(invoiceLineItems.expenseId, expenses.id))
      .where(and(eq(invoices.companyId, companyId), BOOKED)),
    db
      .select({
        orderId: expenses.orderId,
        cost: sql<number>`coalesce(sum(${expenses.amountPence} - ${expenses.vatPence}), 0)`.mapWith(Number),
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.companyId, companyId),
          isNotNull(expenses.orderId),
          ne(expenses.status, "pending"),
        ),
      )
      .groupBy(expenses.orderId),
    listRebillableExpenses(companyId),
  ]);

  const byOrder = (rows: Array<{ orderId: string | null; net?: number; cost?: number }>) =>
    new Map(rows.map((r) => [r.orderId!, r.net ?? r.cost ?? 0]));
  const invoicedBy = byOrder(invoiced);
  const creditedBy = byOrder(credited);
  const costBy = byOrder(costs);

  const rebillOwn = new Map<string, number>();
  const rebillElsewhere = new Map<string, number>();
  for (const l of rebillLines) {
    const net = lineNetPence(l);
    if (l.invoiceOrderId && l.invoiceOrderId === l.expenseOrderId) {
      rebillOwn.set(l.invoiceOrderId, (rebillOwn.get(l.invoiceOrderId) ?? 0) + net);
    } else if (l.expenseOrderId) {
      rebillElsewhere.set(l.expenseOrderId, (rebillElsewhere.get(l.expenseOrderId) ?? 0) + net);
    }
  }
  const unbilledBy = new Map<string, number>();
  for (const e of rebillable) {
    if (e.orderId) unbilledBy.set(e.orderId, (unbilledBy.get(e.orderId) ?? 0) + e.pricePence);
  }

  return orderRows.map((o) => {
    const invoicedPence = (invoicedBy.get(o.id) ?? 0) - (creditedBy.get(o.id) ?? 0);
    const rebilledElsewherePence = rebillElsewhere.get(o.id) ?? 0;
    const unbilledRebillablePence = unbilledBy.get(o.id) ?? 0;
    // Recharges on the order's own invoices aren't progress against the quote.
    const workInvoicedPence = invoicedPence - (rebillOwn.get(o.id) ?? 0);
    const stillToInvoicePence =
      (o.status === "cancelled" ? 0 : Math.max(0, o.netPence - workInvoicedPence)) +
      unbilledRebillablePence;
    const costPence = costBy.get(o.id) ?? 0;
    const revenuePence = invoicedPence + rebilledElsewherePence;
    return {
      orderId: o.id,
      number: o.number,
      status: o.status,
      clientId: o.clientId,
      clientName: o.clientName,
      quotedPence: o.netPence,
      invoicedPence,
      rebilledElsewherePence,
      unbilledRebillablePence,
      stillToInvoicePence,
      current: margin(revenuePence, costPence),
      projected: margin(revenuePence + stillToInvoicePence, costPence),
    };
  });
}

export async function getOrderProfitability(companyId: string, orderId: string) {
  const [row] = await listOrderProfitability(companyId, [orderId]);
  return row ?? null;
}

export type ClientProfitability = Margin & {
  clientId: string;
  clientName: string;
  unbilledRebillablePence: number;
};

/**
 * Margin per client for a period (or all time): invoiced revenue net of VAT
 * and credit notes, against expenses tagged to the client or their orders.
 */
export async function listClientProfitability(
  companyId: string,
  period: { from: string | null; to: string | null },
  clientId?: string,
): Promise<ClientProfitability[]> {
  const db = getDb();
  const inPeriod = (col: typeof invoices.issueDate | typeof creditNotes.issueDate | typeof expenses.spentAt) =>
    and(period.from ? gte(col, period.from) : undefined, period.to ? lte(col, period.to) : undefined);
  const [clientRows, invoiced, credited, costs, rebillable] = await Promise.all([
    db
      .select({ id: clients.id, name: clientDisplayNameSql.as("client_name") })
      .from(clients)
      .where(and(eq(clients.companyId, companyId), clientId ? eq(clients.id, clientId) : undefined)),
    db
      .select({ clientId: invoices.clientId, net: sum(invoices.netPence).mapWith(Number) })
      .from(invoices)
      .where(and(eq(invoices.companyId, companyId), BOOKED, inPeriod(invoices.issueDate)))
      .groupBy(invoices.clientId),
    db
      .select({ clientId: creditNotes.clientId, net: sum(creditNotes.netPence).mapWith(Number) })
      .from(creditNotes)
      .where(
        and(
          eq(creditNotes.companyId, companyId),
          eq(creditNotes.status, "issued"),
          inPeriod(creditNotes.issueDate),
        ),
      )
      .groupBy(creditNotes.clientId),
    db
      .select({
        clientId: expenses.clientId,
        cost: sql<number>`coalesce(sum(${expenses.amountPence} - ${expenses.vatPence}), 0)`.mapWith(Number),
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.companyId, companyId),
          isNotNull(expenses.clientId),
          ne(expenses.status, "pending"),
          inPeriod(expenses.spentAt),
        ),
      )
      .groupBy(expenses.clientId),
    listRebillableExpenses(companyId, { clientId }),
  ]);

  const invoicedBy = new Map(invoiced.map((r) => [r.clientId, r.net]));
  const creditedBy = new Map(credited.map((r) => [r.clientId, r.net]));
  const costBy = new Map(costs.map((r) => [r.clientId!, r.cost]));
  const unbilledBy = new Map<string, number>();
  for (const e of rebillable) {
    unbilledBy.set(e.clientId, (unbilledBy.get(e.clientId) ?? 0) + e.pricePence);
  }

  return clientRows
    .map((c) => ({
      clientId: c.id,
      clientName: c.name,
      unbilledRebillablePence: unbilledBy.get(c.id) ?? 0,
      ...margin((invoicedBy.get(c.id) ?? 0) - (creditedBy.get(c.id) ?? 0), costBy.get(c.id) ?? 0),
    }))
    .filter((c) => clientId || c.revenuePence !== 0 || c.costPence !== 0 || c.unbilledRebillablePence > 0)
    .sort((a, b) => b.revenuePence - a.revenuePence);
}

/** Order choices for tagging an expense. */
export async function listOrderOptions(companyId: string) {
  return getDb()
    .select({
      id: orders.id,
      number: orders.number,
      clientId: orders.clientId,
      clientName: clientDisplayNameSql.as("client_name"),
      status: orders.status,
    })
    .from(orders)
    .innerJoin(clients, eq(orders.clientId, clients.id))
    .where(eq(orders.companyId, companyId))
    .orderBy(desc(orders.createdAt))
    .limit(300);
}
