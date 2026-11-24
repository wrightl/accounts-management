import "server-only";
import type { DocumentCurrencyColumns } from "@/lib/document-rate";
import { and, eq } from "drizzle-orm";
import {
  companies,
  orderLineItems,
  orderPaymentMilestones,
  orders,
  quotePaymentMilestones,
  quotes,
} from "@/db/schema";
import { rowOfCompany } from "@/lib/tenant-scope";
import { carriedLineTax } from "@/lib/tax-codes";
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
  quote: Omit<DocumentCurrencyColumns, "fxRateSource"> & {
    id: string;
    clientId: string;
    notes: string | null;
    orderId: string | null;
    fxRateSource: string | null;
  };
  lines: Array<{
    description: string;
    quantity: number;
    unitPricePence: number;
    vatRate: number;
    taxCode?: string | null;
    taxCodeNeedsReview?: boolean;
    discountPercent: number;
    position: number;
  }>;
};

export async function createOrderFromQuote(
  tx: Tx,
  companyId: string,
  source: QuoteOrderSource,
  milestones: PaymentMilestoneInput[],
  createdByUserId: string | null,
): Promise<string> {
  if (source.quote.orderId) throw new Error("Quote already has an order");

  const issueDate = todayIsoDate();
  const number = await allocateOrderNumber(tx, companyId, issueDate);

  const [order] = await tx
    .insert(orders)
    .values({
      companyId,
      number,
      clientId: source.quote.clientId,
      quoteId: source.quote.id,
      status: "active",
      issueDate,
      notes: source.quote.notes,
      // The quote's prices, currency and rate carry over; invoices raised from
      // the order each take the rate for their own issue date.
      currency: source.quote.currency,
      fxRate: source.quote.fxRate,
      fxRateDate: source.quote.fxRateDate,
      fxRateSource: source.quote.fxRateSource as DocumentCurrencyColumns["fxRateSource"],
      netMinor: source.quote.netMinor,
      vatMinor: source.quote.vatMinor,
      grossMinor: source.quote.grossMinor,
      netPence: source.quote.netPence,
      vatPence: source.quote.vatPence,
      grossPence: source.quote.grossPence,
      createdByUserId,
    })
    .returning({ id: orders.id });

  const [company] = await tx
    .select({ vatRegistered: companies.vatRegistered })
    .from(companies)
    .where(eq(companies.id, companyId));
  const lineValues: OrderLineValue[] = source.lines.map((l) => ({
    description: l.description,
    quantity: l.quantity,
    unitPricePence: l.unitPricePence,
    ...carriedLineTax(l, company ?? { vatRegistered: false }),
    discountPercent: l.discountPercent,
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
  companyId: string,
  quoteId: string,
  milestones: PaymentMilestoneInput[],
) {
  // The insert below has no WHERE, so check the quote is the company's first.
  const [own] = await tx
    .select({ id: quotes.id })
    .from(quotes)
    .where(and(eq(quotes.id, quoteId), eq(quotes.companyId, companyId)));
  if (!own) throw new Error("Quote not found");
  await tx
    .delete(quotePaymentMilestones)
    .where(
      and(
        eq(quotePaymentMilestones.quoteId, quoteId),
        rowOfCompany(quotePaymentMilestones.quoteId, quotes, companyId),
      ),
    );
  if (milestones.length === 0) return;
  await tx
    .insert(quotePaymentMilestones)
    .values(quoteMilestoneRowsToInsert(quoteId, milestones));
}

export async function replaceOrderPaymentMilestones(
  tx: Tx,
  companyId: string,
  orderId: string,
  milestones: PaymentMilestoneInput[],
) {
  // The insert below has no WHERE, so check the order is the company's first.
  const [own] = await tx
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.companyId, companyId)));
  if (!own) throw new Error("Order not found");
  await tx
    .delete(orderPaymentMilestones)
    .where(
      and(
        eq(orderPaymentMilestones.orderId, orderId),
        rowOfCompany(orderPaymentMilestones.orderId, orders, companyId),
      ),
    );
  if (milestones.length === 0) return;
  await tx
    .insert(orderPaymentMilestones)
    .values(milestoneRowsToInsert(orderId, milestones));
}
