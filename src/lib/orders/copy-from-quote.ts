import "server-only";
import { eq } from "drizzle-orm";
import {
  orderLineItems,
  orderPaymentMilestones,
  orders,
  quotePaymentMilestones,
  quotes,
} from "@/db/schema";
import type { Tx } from "@/lib/invoices/allocate";
import { allocateOrderNumber } from "@/lib/invoices/allocate";
import { todayIsoDate } from "@/lib/invoices/status";
import {
  milestoneRowsToInsert,
  quoteMilestoneRowsToInsert,
  type OrderLineValue,
} from "@/lib/orders/queries";
import type { PaymentMilestoneInput } from "@/lib/quotes/payment-schedule";

type QuoteOrderSource = {
  quote: {
    id: string;
    clientId: string;
    notes: string | null;
    netPence: number;
    vatPence: number;
    grossPence: number;
    orderId: string | null;
  };
  lines: Array<{
    description: string;
    quantity: number;
    unitPricePence: number;
    vatRate: number;
    position: number;
  }>;
};

export async function createOrderFromQuote(
  tx: Tx,
  source: QuoteOrderSource,
  milestones: PaymentMilestoneInput[],
  createdByUserId: string,
): Promise<string> {
  if (source.quote.orderId) throw new Error("Quote already has an order");

  const issueDate = todayIsoDate();
  const number = await allocateOrderNumber(tx, issueDate);

  const [order] = await tx
    .insert(orders)
    .values({
      number,
      clientId: source.quote.clientId,
      quoteId: source.quote.id,
      status: "active",
      issueDate,
      notes: source.quote.notes,
      netPence: source.quote.netPence,
      vatPence: source.quote.vatPence,
      grossPence: source.quote.grossPence,
      createdByUserId,
    })
    .returning({ id: orders.id });

  const lineValues: OrderLineValue[] = source.lines.map((l) => ({
    description: l.description,
    quantity: l.quantity,
    unitPricePence: l.unitPricePence,
    vatRate: l.vatRate,
    position: l.position,
  }));

  await tx.insert(orderLineItems).values(
    lineValues.map((l) => ({ ...l, orderId: order.id })),
  );

  if (milestones.length > 0) {
    await tx.insert(orderPaymentMilestones).values(
      milestoneRowsToInsert(order.id, milestones),
    );
  }

  await tx
    .update(quotes)
    .set({ orderId: order.id })
    .where(eq(quotes.id, source.quote.id));

  return order.id;
}

export async function replaceQuotePaymentMilestones(
  tx: Tx,
  quoteId: string,
  milestones: PaymentMilestoneInput[],
) {
  await tx
    .delete(quotePaymentMilestones)
    .where(eq(quotePaymentMilestones.quoteId, quoteId));
  if (milestones.length === 0) return;
  await tx
    .insert(quotePaymentMilestones)
    .values(quoteMilestoneRowsToInsert(quoteId, milestones));
}

export async function replaceOrderPaymentMilestones(
  tx: Tx,
  orderId: string,
  milestones: PaymentMilestoneInput[],
) {
  await tx
    .delete(orderPaymentMilestones)
    .where(eq(orderPaymentMilestones.orderId, orderId));
  if (milestones.length === 0) return;
  await tx
    .insert(orderPaymentMilestones)
    .values(milestoneRowsToInsert(orderId, milestones));
}
