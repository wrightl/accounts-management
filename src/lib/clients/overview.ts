import "server-only";
import { and, desc, eq, inArray, ne, sum } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, invoices, orders, payments, quotes } from "@/db/schema";
import { formatGBP } from "@/lib/money";
import {
  effectiveStatus,
  todayIsoDate,
  type InvoiceStatus,
} from "@/lib/invoices/status";
import { quoteStatusLabel, formatQuoteVersion, QUOTE_STATUSES, type QuoteStatus } from "@/lib/quotes/status";

const PIPELINE_QUOTE_STATUSES = ["draft", "sent", "accepted"] as const;

export type ClientOverviewData = {
  client: typeof clients.$inferSelect;
  quotes: Array<{
    id: string;
    number: string;
    versionLabel: string;
    status: string;
    statusLabel: string;
    grossFormatted: string;
  }>;
  orders: Array<{
    id: string;
    number: string;
    status: string;
    grossFormatted: string;
  }>;
  invoiceRows: Array<{
    id: string;
    number: string;
    status: InvoiceStatus;
    issueDate: string | null;
    dueDate: string | null;
    grossFormatted: string;
  }>;
  metrics: {
    pipelineQuoteCount: number;
    pipelineQuoteFormatted: string;
    activeOrderCount: number;
    activeOrderFormatted: string;
    outstandingFormatted: string;
    overdueFormatted: string;
    paidToDateFormatted: string;
    invoiceCount: number;
  };
  quoteStatusBreakdown: Array<{
    status: QuoteStatus;
    label: string;
    count: number;
    grossFormatted: string;
    percent: number;
  }>;
};

export async function getClientOverview(
  companyId: string,
  clientId: string,
): Promise<ClientOverviewData | null> {
  const db = getDb();
  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.companyId, companyId)))
    .limit(1);
  if (!client) return null;

  const quoteRows = await db
    .select({
      id: quotes.id,
      number: quotes.number,
      version: quotes.version,
      status: quotes.status,
      grossPence: quotes.grossPence,
    })
    .from(quotes)
    .where(and(eq(quotes.clientId, clientId), eq(quotes.companyId, companyId)))
    .orderBy(desc(quotes.createdAt));

  const orderRows = await db
    .select({
      id: orders.id,
      number: orders.number,
      status: orders.status,
      grossPence: orders.grossPence,
    })
    .from(orders)
    .where(and(eq(orders.clientId, clientId), eq(orders.companyId, companyId)))
    .orderBy(desc(orders.createdAt));

  const invoiceList = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      status: invoices.status,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      grossPence: invoices.grossPence,
    })
    .from(invoices)
    .where(and(eq(invoices.clientId, clientId), eq(invoices.companyId, companyId)))
    .orderBy(desc(invoices.createdAt));

  const today = todayIsoDate();

  let pipelineQuotePence = 0;
  let pipelineQuoteCount = 0;
  for (const q of quoteRows) {
    if ((PIPELINE_QUOTE_STATUSES as readonly string[]).includes(q.status)) {
      pipelineQuoteCount += 1;
      pipelineQuotePence += q.grossPence;
    }
  }

  let activeOrderPence = 0;
  let activeOrderCount = 0;
  for (const o of orderRows) {
    if (o.status === "active") {
      activeOrderCount += 1;
      activeOrderPence += o.grossPence;
    }
  }

  const openInvoices = invoiceList.filter(
    (inv) => inv.status !== "draft" && inv.status !== "void" && inv.status !== "paid",
  );

  let outstandingPence = 0;
  let overduePence = 0;

  if (openInvoices.length > 0) {
    const openIds = openInvoices.map((i) => i.id);
    const paidByInvoice = await db
      .select({
        invoiceId: payments.invoiceId,
        total: sum(payments.amountPence).mapWith(Number),
      })
      .from(payments)
      .where(inArray(payments.invoiceId, openIds))
      .groupBy(payments.invoiceId);

    const paidMap = new Map(paidByInvoice.map((r) => [r.invoiceId, r.total ?? 0]));

    for (const inv of openInvoices) {
      const paid = paidMap.get(inv.id) ?? 0;
      const balance = Math.max(0, inv.grossPence - paid);
      if (balance === 0) continue;
      outstandingPence += balance;
      const eff = effectiveStatus(inv.status as InvoiceStatus, inv.dueDate, today);
      if (eff === "overdue") overduePence += balance;
    }
  }

  const [paidRow] = await db
    .select({ total: sum(payments.amountPence).mapWith(Number) })
    .from(payments)
    .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
    .where(and(eq(invoices.clientId, clientId), ne(invoices.status, "void")));

  const paidToDatePence = paidRow?.total ?? 0;

  const statusTotals = new Map<QuoteStatus, { count: number; grossPence: number }>();
  for (const status of QUOTE_STATUSES) {
    statusTotals.set(status, { count: 0, grossPence: 0 });
  }
  for (const q of quoteRows) {
    const bucket = statusTotals.get(q.status as QuoteStatus);
    if (bucket) {
      bucket.count += 1;
      bucket.grossPence += q.grossPence;
    }
  }

  const quoteStatusBreakdown = QUOTE_STATUSES.map((status) => {
    const bucket = statusTotals.get(status)!;
    return {
      status,
      label: quoteStatusLabel(status),
      count: bucket.count,
      grossFormatted: formatGBP(bucket.grossPence),
      percent:
        quoteRows.length > 0 ? Math.round((bucket.count / quoteRows.length) * 100) : 0,
    };
  }).filter((row) => row.count > 0);

  return {
    client,
    quotes: quoteRows.map((q) => ({
      id: q.id,
      number: q.number,
      versionLabel: formatQuoteVersion(q.version),
      status: q.status,
      statusLabel: quoteStatusLabel(q.status as QuoteStatus),
      grossFormatted: formatGBP(q.grossPence),
    })),
    orders: orderRows.map((o) => ({
      id: o.id,
      number: o.number,
      status: o.status,
      grossFormatted: formatGBP(o.grossPence),
    })),
    invoiceRows: invoiceList.map((inv) => ({
      id: inv.id,
      number: inv.number,
      status: effectiveStatus(inv.status as InvoiceStatus, inv.dueDate, today),
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      grossFormatted: formatGBP(inv.grossPence),
    })),
    metrics: {
      pipelineQuoteCount,
      pipelineQuoteFormatted: formatGBP(pipelineQuotePence),
      activeOrderCount,
      activeOrderFormatted: formatGBP(activeOrderPence),
      outstandingFormatted: formatGBP(outstandingPence),
      overdueFormatted: formatGBP(overduePence),
      paidToDateFormatted: formatGBP(paidToDatePence),
      invoiceCount: invoiceList.length,
    },
    quoteStatusBreakdown,
  };
}
