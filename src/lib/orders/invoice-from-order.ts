import "server-only";
import { and, eq, ne, sum } from "drizzle-orm";
import type { Database } from "@/db";
import {
  invoices,
  orderPaymentMilestones,
  type orderLineItems,
} from "@/db/schema";
import { defaultDueDate, todayIsoDate } from "@/lib/invoices/status";
import { invoiceTotals, type LineItem } from "@/lib/money";

export type InvoiceFromOrderMode = "milestone" | "remaining" | "part";

export type OrderMilestoneRow = typeof orderPaymentMilestones.$inferSelect;

export type OrderLineRow = typeof orderLineItems.$inferSelect;

export function resolveMilestoneAmountPence(
  milestone: Pick<OrderMilestoneRow, "amountPence" | "percentBasisPoints">,
  orderGrossPence: number,
): number {
  if (milestone.amountPence != null) return milestone.amountPence;
  if (milestone.percentBasisPoints != null) {
    return Math.round((orderGrossPence * milestone.percentBasisPoints) / 10000);
  }
  throw new Error("Milestone has no amount or percentage");
}

export function resolveMilestoneDueDate(
  milestone: Pick<OrderMilestoneRow, "dueDate" | "dueInDays">,
  issueDate: string,
): string {
  if (milestone.dueDate) return milestone.dueDate;
  if (milestone.dueInDays != null) {
    return defaultDueDate(issueDate, milestone.dueInDays);
  }
  throw new Error("Milestone has no due date");
}

export async function sumInvoicedPenceForOrder(
  db: Database,
  orderId: string,
): Promise<number> {
  const [row] = await db
    .select({ total: sum(invoices.grossPence).mapWith(Number) })
    .from(invoices)
    .where(and(eq(invoices.orderId, orderId), ne(invoices.status, "void")));
  return row?.total ?? 0;
}

export async function getUsedMilestoneIds(
  db: Database,
  orderId: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ milestoneId: invoices.paymentMilestoneId })
    .from(invoices)
    .where(and(eq(invoices.orderId, orderId), ne(invoices.status, "void")));
  return new Set(
    rows.map((r) => r.milestoneId).filter((id): id is string => id != null),
  );
}

export function buildInvoiceLineValues(params: {
  mode: InvoiceFromOrderMode;
  amountPence: number;
  orderNumber: string;
  milestoneLabel?: string;
  orderLines: OrderLineRow[];
  priorInvoicedPence: number;
}): Array<{
  description: string;
  quantity: number;
  unitPricePence: number;
  vatRate: number;
  position: number;
}> {
  const { mode, amountPence, orderNumber, milestoneLabel, orderLines, priorInvoicedPence } =
    params;

  if (
    mode === "remaining" &&
    priorInvoicedPence === 0 &&
    orderLines.length > 0
  ) {
    return orderLines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPricePence: l.unitPricePence,
      vatRate: l.vatRate,
      position: l.position,
    }));
  }

  let description: string;
  if (mode === "milestone" && milestoneLabel) {
    description = `${milestoneLabel} — ${orderNumber}`;
  } else if (mode === "part") {
    description = `Part invoice — ${orderNumber}`;
  } else {
    description = `Remaining balance — ${orderNumber}`;
  }

  return [
    {
      description,
      quantity: 1,
      unitPricePence: amountPence,
      vatRate: 0,
      position: 0,
    },
  ];
}

export function resolveInvoiceDueDate(params: {
  override: string | null;
  milestone: OrderMilestoneRow | null;
  issueDate: string;
  paymentTermsDays: number;
}): string {
  if (params.override) return params.override;
  if (params.milestone) {
    return resolveMilestoneDueDate(params.milestone, params.issueDate);
  }
  return defaultDueDate(params.issueDate, params.paymentTermsDays);
}

export function computePartAmountPence(params: {
  partMode: "amount" | "percent";
  amountPounds?: string;
  percent?: string;
  orderGrossPence: number;
}): number | { error: string } {
  if (params.partMode === "amount") {
    const raw = params.amountPounds?.trim() ?? "";
    const pounds = Number(raw.replace(/[£,\s]/g, ""));
    if (!Number.isFinite(pounds) || pounds <= 0) {
      return { error: "Enter a valid part amount" };
    }
    return Math.round(pounds * 100);
  }

  const pct = Number(params.percent?.trim() ?? "");
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
    return { error: "Enter a valid percentage between 0 and 100" };
  }
  return Math.round((params.orderGrossPence * pct) / 100);
}

export function validateInvoiceAmount(
  amountPence: number,
  remainingPence: number,
): string | null {
  if (amountPence <= 0) return "Invoice amount must be greater than zero";
  if (amountPence > remainingPence) {
    return "Amount exceeds remaining balance on this order";
  }
  return null;
}

export { invoiceTotals, todayIsoDate };
export type { LineItem };
