import "server-only";
import { documentColumns, documentRate, type DocumentRateDetails } from "@/lib/document-rate";
import { and, asc, eq } from "drizzle-orm";
import {
  companies,
  invoiceLineItems,
  invoices,
  orderLineItems,
  orderPaymentMilestones,
  orders,
} from "@/db/schema";
import { rowOfCompany } from "@/lib/tenant-scope";
import { allocateInvoiceNumber, type Tx } from "@/lib/invoices/allocate";
import {
  buildInvoiceLineValues,
  resolveMilestoneAmountPence,
  resolveMilestoneDueDate,
} from "@/lib/orders/invoice-from-order";

export type DepositInvoice = {
  invoiceId: string;
  publicToken: string;
  /** In the order's currency. */
  amountMinor: number;
  currency: string;
};

/**
 * The rate for a deposit issued on `issueDate` when a client accepts a quote:
 * the Bank of England rate for that date, or, since the client is waiting and
 * can't be asked to retry, the quote's own rate when that can't be fetched.
 */
export async function depositRateFor(
  quote: {
    currency: string;
    fxRate: number;
    fxRateDate: string | null;
    fxRateSource: string | null;
  },
  issueDate: string,
): Promise<DocumentRateDetails> {
  const fetched = await documentRate(quote.currency, issueDate);
  if (fetched.ok) return fetched.rate;
  return {
    currency: quote.currency,
    fxRate: quote.fxRate,
    fxRateDate: quote.fxRateDate,
    fxRateSource: quote.fxRateSource as DocumentRateDetails["fxRateSource"],
  };
}

/**
 * Raise the order's first payment milestone as a sent invoice, so the client
 * can pay it straight after accepting the quote. Returns null when the order
 * has no payment schedule. `rate` is the rate for `issueDate` in the order's
 * currency, fetched by the caller before its transaction for that same date.
 */
export async function raiseDepositInvoice(
  tx: Tx,
  params: {
    companyId: string;
    orderId: string;
    createdByUserId: string | null;
    issueDate: string;
    rate: DocumentRateDetails;
  },
): Promise<DepositInvoice | null> {
  const [order] = await tx
    .select()
    .from(orders)
    .where(and(eq(orders.id, params.orderId), eq(orders.companyId, params.companyId)))
    .limit(1);
  if (!order) throw new Error("Order not found");
  if (params.rate.currency !== order.currency) {
    throw new Error(`Deposit rate is for ${params.rate.currency}, not the order's ${order.currency}`);
  }

  const [milestone] = await tx
    .select()
    .from(orderPaymentMilestones)
    .where(
      and(
        eq(orderPaymentMilestones.orderId, order.id),
        rowOfCompany(orderPaymentMilestones.orderId, orders, params.companyId),
      ),
    )
    .orderBy(asc(orderPaymentMilestones.position))
    .limit(1);
  if (!milestone) return null;

  const orderLines = await tx
    .select()
    .from(orderLineItems)
    .where(
      and(
        eq(orderLineItems.orderId, order.id),
        rowOfCompany(orderLineItems.orderId, orders, params.companyId),
      ),
    )
    .orderBy(asc(orderLineItems.position));

  const [company] = await tx
    .select({ vatRegistered: companies.vatRegistered })
    .from(companies)
    .where(eq(companies.id, params.companyId));
  // In the order's currency.
  const amountPence = resolveMilestoneAmountPence(milestone, order.grossMinor);
  const issueDate = params.issueDate;
  const lineValues = buildInvoiceLineValues({
    company: company ?? { vatRegistered: false },
    mode: "milestone",
    amountPence,
    orderNumber: order.number,
    milestoneLabel: milestone.label,
    orderLines,
    priorInvoicedPence: 0,
  });
  const totals = documentColumns(lineValues, params.rate);

  const number = await allocateInvoiceNumber(tx, params.companyId, issueDate);
  const [inv] = await tx
    .insert(invoices)
    .values({
      companyId: params.companyId,
      number,
      clientId: order.clientId,
      status: "sent",
      sentAt: new Date(),
      issueDate,
      dueDate: resolveMilestoneDueDate(milestone, issueDate),
      notes: order.notes,
      ...totals,
      orderId: order.id,
      paymentMilestoneId: milestone.id,
      createdByUserId: params.createdByUserId,
    })
    .returning({ id: invoices.id, publicToken: invoices.publicToken });

  await tx.insert(invoiceLineItems).values(
    lineValues.map((l) => ({ ...l, invoiceId: inv.id })),
  );

  return {
    invoiceId: inv.id,
    publicToken: inv.publicToken,
    amountMinor: totals.grossMinor,
    currency: totals.currency,
  };
}
