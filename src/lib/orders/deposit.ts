import "server-only";
import { documentTotals, STERLING_RATE } from "@/lib/currency";
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
import { todayIsoDate } from "@/lib/invoices/status";

export type DepositInvoice = {
  invoiceId: string;
  publicToken: string;
  amountPence: number;
};

/**
 * Raise the order's first payment milestone as a sent invoice, so the client
 * can pay it straight after accepting the quote. Returns null when the order
 * has no payment schedule.
 */
export async function raiseDepositInvoice(
  tx: Tx,
  params: { companyId: string; orderId: string; createdByUserId: string | null },
): Promise<DepositInvoice | null> {
  const [order] = await tx
    .select()
    .from(orders)
    .where(eq(orders.id, params.orderId))
    .limit(1);
  if (!order) throw new Error("Order not found");

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
  const amountPence = resolveMilestoneAmountPence(milestone, order.grossPence);
  const issueDate = todayIsoDate();
  const lineValues = buildInvoiceLineValues({
    company: company ?? { vatRegistered: false },
    mode: "milestone",
    amountPence,
    orderNumber: order.number,
    milestoneLabel: milestone.label,
    orderLines,
    priorInvoicedPence: 0,
  });
  const totals = documentTotals(lineValues, STERLING_RATE);

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

  return { invoiceId: inv.id, publicToken: inv.publicToken, amountPence: totals.grossPence };
}
