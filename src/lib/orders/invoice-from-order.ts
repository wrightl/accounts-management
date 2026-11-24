import "server-only";
import { storedLineTax } from "@/lib/documents/schema";
import { carriedLineTax, type StoredLineTax } from "@/lib/tax-codes";
import { and, eq, ne, sum } from "drizzle-orm";
import type { Database } from "@/db";
import {
  creditNotes,
  invoices,
  orderPaymentMilestones,
  type orderLineItems,
} from "@/db/schema";
import { defaultDueDate, todayIsoDate } from "@/lib/invoices/status";
import { invoiceTotals, lineNetPence, lineVatPence, type LineItem } from "@/lib/money";

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

/**
 * Gross invoiced against an order, in the order's currency (its invoices are
 * raised in it), net of issued credit notes on those invoices. A credited
 * amount counts as not yet invoiced, so it can be billed again (or cleared by
 * completing the order).
 */
export async function sumInvoicedForOrder(
  db: Database,
  companyId: string,
  orderId: string,
): Promise<number> {
  const [row] = await db
    .select({ total: sum(invoices.grossMinor).mapWith(Number) })
    .from(invoices)
    .where(
      and(
        eq(invoices.orderId, orderId),
        eq(invoices.companyId, companyId),
        ne(invoices.status, "void"),
      ),
    );
  const [credited] = await db
    .select({ total: sum(creditNotes.grossMinor).mapWith(Number) })
    .from(creditNotes)
    .innerJoin(invoices, eq(creditNotes.invoiceId, invoices.id))
    .where(
      and(
        eq(invoices.orderId, orderId),
        eq(invoices.companyId, companyId),
        eq(creditNotes.status, "issued"),
      ),
    );
  return (row?.total ?? 0) - (credited?.total ?? 0);
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
  /** Used only to code order lines saved before they had a tax code. */
  company: { vatRegistered?: boolean | null };
}): Array<
  {
    description: string;
    quantity: number;
    unitPricePence: number;
    discountPercent: number;
    position: number;
  } & StoredLineTax
> {
  const { mode, amountPence, orderNumber, milestoneLabel, orderLines, priorInvoicedPence, company } =
    params;
  const taxOf = (l: OrderLineRow) => carriedLineTax(l, company);

  if (
    mode === "remaining" &&
    priorInvoicedPence === 0 &&
    orderLines.length > 0
  ) {
    return orderLines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPricePence: l.unitPricePence,
      ...taxOf(l),
      discountPercent: l.discountPercent,
      position: l.position,
    }));
  }

  // amountPence is gross. Back out net so VAT is not double-counted. Lines
  // only share one invoice line when they share both code and rate: zero
  // rated and exempt are both 0% but must stay apart.
  const taxes = orderLines.map(taxOf);
  const kinds = [...new Map(taxes.map((t) => [`${t.taxCode}:${t.vatRate}`, t])).values()];
  const single = kinds.length === 1 ? kinds[0]! : null;

  if (single != null || orderLines.length === 0) {
    const tax: StoredLineTax = single ?? storedLineTax(company, { vatRate: 0 });
    const rate = tax.vatRate;
    const net = Math.round((amountPence * 100) / (100 + rate));
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
        unitPricePence: net,
        ...tax,
        discountPercent: 0,
        position: 0,
      },
    ];
  }

  // Mixed rates: split gross by each line's gross weight, preserve rates.
  const lineGrosses = orderLines.map((l) => {
    return { line: l, gross: lineNetPence(l) + lineVatPence(l) };
  });
  const totalGross = lineGrosses.reduce((s, x) => s + x.gross, 0) || 1;

  return lineGrosses.map(({ line, gross }, i) => {
    const shareGross = Math.round((amountPence * gross) / totalGross);
    const net = Math.round((shareGross * 100) / (100 + line.vatRate));
    return {
      description: `${line.description} (${mode === "part" ? "part" : "balance"}) — ${orderNumber}`,
      quantity: 1,
      unitPricePence: net,
      ...taxOf(line),
      discountPercent: 0,
      position: i,
    };
  });
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
