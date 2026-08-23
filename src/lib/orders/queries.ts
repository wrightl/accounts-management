import "server-only";
import { desc, eq } from "drizzle-orm";
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
import { formatGBP } from "@/lib/money";
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
import { APP_TIMEZONE } from "@/lib/dates";

export async function listOrders() {
  const db = getDb();
  const rows = await db
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
    .innerJoin(clients, eq(orders.clientId, clients.id))
    .leftJoin(quotes, eq(orders.quoteId, quotes.id))
    .orderBy(desc(orders.createdAt));

  return rows.map((r) => ({
    ...r,
    grossFormatted: formatGBP(r.grossPence),
  }));
}

function formatCreatedDate(createdAt: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(createdAt);
}

export async function getOrderDetail(id: string) {
  const db = getDb();
  const rows = await db
    .select({ order: orders, client: clients, quote: quotes })
    .from(orders)
    .innerJoin(clients, eq(orders.clientId, clients.id))
    .leftJoin(quotes, eq(orders.quoteId, quotes.id))
    .where(eq(orders.id, id))
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
    .where(eq(invoices.orderId, id))
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
      createdDateFormatted: formatCreatedDate(order.createdAt),
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
