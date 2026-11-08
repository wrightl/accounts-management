import "server-only";
import { and, asc, count, desc, eq, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { clientDisplayNameSql } from "@/lib/clients/sql";
import {
  clients,
  invoices,
  orderLineItems,
  orderPaymentMilestones,
  orders,
  quotePaymentMilestones,
  quotes,
} from "@/db/schema";
import { type ListPaging, fetchPage } from "@/lib/list-paging";
import { formatGBP } from "@/lib/money";
import { sortExpr, sortNumbered, sortRank, sortText } from "@/lib/sql-paging";
import type { TableSort } from "@/lib/table-sort";
import {
  effectiveStatus,
  todayIsoDate,
  type InvoiceStatus,
} from "@/lib/invoices/status";
import {
  getUsedMilestoneIds,
  resolveMilestoneAmountPence,
  sumInvoicedPenceForOrder,
} from "@/lib/orders/invoice-from-order";
import type { PaymentMilestoneInput } from "@/lib/quotes/payment-schedule";

export type OrderSortColumn = "created" | "number" | "client" | "quote" | "status" | "total";
const ORDER_STATUS_ORDER = ["draft", "active", "completed", "cancelled"] as const;

function orderListOrderBy({ sort, dir }: TableSort<OrderSortColumn>): SQL[] {
  const by = sortExpr(dir);
  const tiebreak = [desc(orders.createdAt), desc(orders.id)];
  switch (sort) {
    case "number":
      return [...sortNumbered(dir, orders.number), ...tiebreak];
    case "client":
      return [by(sortText(clientDisplayNameSql)), ...tiebreak];
    case "quote":
      return [...sortNumbered(dir, quotes.number), ...tiebreak];
    case "status":
      return [by(sortRank(orders.status, ORDER_STATUS_ORDER)), ...tiebreak];
    case "total":
      return [by(orders.grossPence), ...tiebreak];
    case "created":
      return dir === "asc" ? [asc(orders.createdAt), asc(orders.id)] : tiebreak;
  }
}

/** One page of the orders list, sorted in the database. */
export async function listOrderPage(
  companyId: string,
  options: TableSort<OrderSortColumn> & ListPaging,
) {
  const db = getDb();
  const where = eq(orders.companyId, companyId);
  const clientJoin = and(eq(orders.clientId, clients.id), eq(clients.companyId, companyId));
  const quoteJoin = and(eq(orders.quoteId, quotes.id), eq(quotes.companyId, companyId));
  const page = await fetchPage(
    options,
    async () =>
      (await db.select({ n: count() }).from(orders).innerJoin(clients, clientJoin).where(where))[0]
        ?.n ?? 0,
    ({ limit, offset }) =>
      db
        .select({
          id: orders.id,
          number: orders.number,
          status: orders.status,
          issueDate: orders.issueDate,
          grossPence: orders.grossPence,
          clientName: clientDisplayNameSql.as("client_name"),
          quoteNumber: quotes.number,
        })
        .from(orders)
        .innerJoin(clients, clientJoin)
        .leftJoin(quotes, quoteJoin)
        .where(where)
        .orderBy(...orderListOrderBy(options))
        .limit(limit)
        .offset(offset),
  );
  return { ...page, rows: page.rows.map((r) => ({ ...r, grossFormatted: formatGBP(r.grossPence) })) };
}

export async function getOrderDetail(companyId: string, id: string) {
  const db = getDb();
  const rows = await db
    .select({ order: orders, client: clients, quote: quotes })
    .from(orders)
    .innerJoin(clients, eq(orders.clientId, clients.id))
    .leftJoin(quotes, eq(orders.quoteId, quotes.id))
    .where(and(eq(orders.id, id), eq(orders.companyId, companyId)))
    .limit(1);
  if (!rows[0]) return null;

  const lines = await db
    .select()
    .from(orderLineItems)
    .where(eq(orderLineItems.orderId, id))
    .orderBy(orderLineItems.position);

  const milestones = await db
    .select()
    .from(orderPaymentMilestones)
    .where(eq(orderPaymentMilestones.orderId, id))
    .orderBy(orderPaymentMilestones.position);

  const invoiceRows = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      status: invoices.status,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      grossPence: invoices.grossPence,
      paymentMilestoneId: invoices.paymentMilestoneId,
    })
    .from(invoices)
    .where(and(eq(invoices.orderId, id), eq(invoices.companyId, companyId)))
    .orderBy(desc(invoices.createdAt));

  const today = todayIsoDate();
  const priorInvoicedPence = await sumInvoicedPenceForOrder(db, id);
  const usedMilestoneIds = await getUsedMilestoneIds(db, id);

  const order = rows[0].order;
  const remainingPence = Math.max(0, order.grossPence - priorInvoicedPence);

  const availableMilestones = milestones
    .filter((m) => !usedMilestoneIds.has(m.id))
    .map((m) => {
      let amountPence: number;
      try {
        amountPence = resolveMilestoneAmountPence(m, order.grossPence);
      } catch {
        amountPence = 0;
      }
      return {
        id: m.id,
        label: m.label,
        amountPence,
        amountFormatted: formatGBP(amountPence),
        dueDate: m.dueDate,
        dueInDays: m.dueInDays,
        disabled: amountPence > remainingPence,
      };
    });

  return {
    order: {
      ...order,
      grossFormatted: formatGBP(order.grossPence),
    },
    client: rows[0].client,
    quote: rows[0].quote,
    lines,
    milestones,
    invoices: invoiceRows.map((inv) => ({
      ...inv,
      status: effectiveStatus(inv.status as InvoiceStatus, inv.dueDate, today),
      grossFormatted: formatGBP(inv.grossPence),
    })),
    priorInvoicedPence,
    remainingPence,
    remainingFormatted: formatGBP(remainingPence),
    availableMilestones,
  };
}

export async function getQuotePaymentMilestones(quoteId: string) {
  const db = getDb();
  return db
    .select()
    .from(quotePaymentMilestones)
    .where(eq(quotePaymentMilestones.quoteId, quoteId))
    .orderBy(quotePaymentMilestones.position);
}

export type OrderLineValue = {
  description: string;
  quantity: number;
  unitPricePence: number;
  vatRate: number;
  discountPercent: number;
  position: number;
};

export function milestoneRowsToInsert(
  orderId: string,
  milestones: PaymentMilestoneInput[],
) {
  return milestones.map((m) => ({
    orderId,
    label: m.label,
    amountPence: m.amountPence ?? null,
    percentBasisPoints: m.percentBasisPoints ?? null,
    dueDate: m.dueDate ?? null,
    dueInDays: m.dueInDays ?? null,
    position: m.position,
  }));
}

export function quoteMilestoneRowsToInsert(
  quoteId: string,
  milestones: PaymentMilestoneInput[],
) {
  return milestones.map((m) => ({
    quoteId,
    label: m.label,
    amountPence: m.amountPence ?? null,
    percentBasisPoints: m.percentBasisPoints ?? null,
    dueDate: m.dueDate ?? null,
    dueInDays: m.dueInDays ?? null,
    position: m.position,
  }));
}
