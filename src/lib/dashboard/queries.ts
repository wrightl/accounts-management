import "server-only";
import { and, eq, gte, inArray, lte, ne, sql, sum } from "drizzle-orm";
import type { SessionUser } from "@/lib/auth";
import { getDb } from "@/db";
import {
  clients,
  invoices,
  orders,
  payments,
  quotes,
  recurringInvoices,
} from "@/db/schema";
import { countUnreconciledBankTransactions } from "@/lib/bank/queries";
import { resolvePeriod, todayIsoDate } from "@/lib/dates";
import { getReimbursableSummary } from "@/lib/expenses/queries";
import { listPendingExpenses, listInboundEmailIssues } from "@/lib/expenses/inbound-email";
import {
  countOverdueInvoices,
  getDashboardKpis,
  listOverdueInvoices,
  type OverdueInvoiceRow,
} from "@/lib/invoices/queries";
import type { RecurringLineTemplate } from "@/lib/invoices/recurring";
import { getOrdersSummary, type OrdersSummaryData } from "@/lib/orders/summary";
import { getOwedSummary } from "@/lib/reimbursements/queries";
import {
  getQuotesSummary,
  listExpiringQuotes,
  type ExpiringQuoteRow,
  type QuotesSummaryData,
} from "@/lib/quotes/summary";
import { can } from "@/lib/roles";
import {
  getAgedReceivables,
  getExpenseByCategory,
  getExpenseByMonth,
  getIncomeByMonth,
  getProfitAndLoss,
} from "@/lib/reports/queries";
import { getCompanySettings } from "@/lib/settings/queries";
import {
  getSpendingSeries,
  getSpendingSummary,
  type SpendingSummary,
} from "@/lib/spending/queries";
import type { SpendingSeriesPoint } from "@/lib/spending/series";
import { clientDisplayNameSql } from "@/lib/clients/sql";
import { formatGBP } from "@/lib/money";
import {
  formatDeltaPercent,
  formatMonthLabel,
  parseDashboardPeriod,
  resolveDashboardPeriod,
  trailingChartMonths,
  type DashboardPeriodKey,
} from "@/lib/dashboard/period";

export type { DashboardPeriodKey };

export type HeroKpi = {
  key: "collected" | "outstanding" | "profit" | "pipeline";
  title: string;
  value: string;
  valuePence: number;
  href: string;
  subtitle?: string;
  insight?: string;
  delta: {
    percent: number | null;
    label: string;
    direction: "up" | "down" | "flat";
    caption: string;
  };
  sparkline: number[];
  accent?: "default" | "destructive";
};

export type MonthlyCashPoint = {
  month: string;
  label: string;
  invoicedPence: number;
  collectedPence: number;
  incomePence: number;
  expensePence: number;
  profitPence: number;
  invoicedFormatted: string;
  collectedFormatted: string;
  incomeFormatted: string;
  expenseFormatted: string;
  profitFormatted: string;
};

export type FunnelStage = {
  key: string;
  label: string;
  valuePence: number;
  valueFormatted: string;
  href: string;
};

export type ClientRevenueSlice = {
  clientId: string | null;
  name: string;
  grossPence: number;
  grossFormatted: string;
  percent: number;
};

export type ExpenseCategorySlice = {
  category: string;
  totalPence: number;
  totalFormatted: string;
  percent: number;
};

export type DashboardAttentionData = {
  overdueInvoices: OverdueInvoiceRow[];
  expiringQuotes: ExpiringQuoteRow[];
  unreconciledCount: number;
  pendingExpenses: Awaited<ReturnType<typeof listPendingExpenses>>;
  inboundEmailIssues: Awaited<ReturnType<typeof listInboundEmailIssues>>;
  reimbursableFormatted: string;
  owedToMeFormatted: string;
  owedToCofoundersFormatted: string;
  winRatePercent: number | null;
  unbilledFormatted: string;
  recurringUpcomingFormatted: string;
  dsoDays: number | null;
  overduePercentOfAr: number | null;
};

export type DashboardOverviewData = {
  periodKey: DashboardPeriodKey;
  periodLabel: string;
  compareLabel: string;
  todayLabel: string;
  heroes: HeroKpi[];
  cashSeries: MonthlyCashPoint[];
  incomeExpenseSeries: MonthlyCashPoint[];
  funnel: FunnelStage[];
  agedReceivables: {
    current: string;
    d30: string;
    d60: string;
    d90: string;
    raw: { current: number; d30: number; d60: number; d90: number };
    overduePercent: number | null;
  };
  topClients: ClientRevenueSlice[];
  expenseMix: ExpenseCategorySlice[];
  spending: {
    summary: SpendingSummary;
    series: SpendingSeriesPoint[];
    periodLabel: string;
    compareLabel: string;
    buckets: "day" | "month";
  };
  attention: DashboardAttentionData;
  quotesSummary: QuotesSummaryData;
  ordersSummary: OrdersSummaryData;
  insights: {
    invoicedFormatted: string;
    collectedFormatted: string;
    winRatePercent: number | null;
    unbilledFormatted: string;
    recurringUpcomingFormatted: string;
    dsoDays: number | null;
  };
};

async function getCollectedInPeriod(
  companyId: string,
  from: string,
  to: string,
): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({
      total: sum(payments.amountPence).mapWith(Number),
    })
    .from(payments)
    .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
    .where(
      and(
        eq(invoices.companyId, companyId),
        gte(sql`(${payments.receivedAt} AT TIME ZONE 'Europe/London')::date`, from),
        lte(sql`(${payments.receivedAt} AT TIME ZONE 'Europe/London')::date`, to),
      ),
    );
  return row?.total ?? 0;
}

async function getCollectedByMonth(
  companyId: string,
  from: string,
  to: string,
): Promise<Array<{ month: string; totalPence: number }>> {
  const db = getDb();
  const rows = await db
    .select({
      month: sql<string>`to_char((${payments.receivedAt} AT TIME ZONE 'Europe/London')::date, 'YYYY-MM')`,
      total: sum(payments.amountPence).mapWith(Number),
    })
    .from(payments)
    .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
    .where(
      and(
        eq(invoices.companyId, companyId),
        gte(sql`(${payments.receivedAt} AT TIME ZONE 'Europe/London')::date`, from),
        lte(sql`(${payments.receivedAt} AT TIME ZONE 'Europe/London')::date`, to),
      ),
    )
    .groupBy(
      sql`to_char((${payments.receivedAt} AT TIME ZONE 'Europe/London')::date, 'YYYY-MM')`,
    )
    .orderBy(
      sql`to_char((${payments.receivedAt} AT TIME ZONE 'Europe/London')::date, 'YYYY-MM')`,
    );

  return rows.map((r) => ({
    month: r.month,
    totalPence: r.total ?? 0,
  }));
}

async function getInvoicedGrossInPeriod(
  companyId: string,
  from: string,
  to: string,
): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ total: sum(invoices.grossPence).mapWith(Number) })
    .from(invoices)
    .where(
      and(
        eq(invoices.companyId, companyId),
        ne(invoices.status, "void"),
        ne(invoices.status, "draft"),
        gte(invoices.issueDate, from),
        lte(invoices.issueDate, to),
      ),
    );
  return row?.total ?? 0;
}

async function getInvoicedGrossByMonth(
  companyId: string,
  from: string,
  to: string,
): Promise<Array<{ month: string; totalPence: number }>> {
  const db = getDb();
  const rows = await db
    .select({
      month: sql<string>`to_char(${invoices.issueDate}, 'YYYY-MM')`,
      total: sum(invoices.grossPence).mapWith(Number),
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.companyId, companyId),
        ne(invoices.status, "void"),
        ne(invoices.status, "draft"),
        gte(invoices.issueDate, from),
        lte(invoices.issueDate, to),
      ),
    )
    .groupBy(sql`to_char(${invoices.issueDate}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${invoices.issueDate}, 'YYYY-MM')`);

  return rows.map((r) => ({
    month: r.month,
    totalPence: r.total ?? 0,
  }));
}

async function getTopClientsByRevenue(
  companyId: string,
  from: string,
  to: string,
  limit = 5,
): Promise<ClientRevenueSlice[]> {
  const db = getDb();
  const rows = await db
    .select({
      clientId: invoices.clientId,
      name: clientDisplayNameSql.as("client_name"),
      total: sum(invoices.grossPence).mapWith(Number),
    })
    .from(invoices)
    .innerJoin(clients, eq(invoices.clientId, clients.id))
    .where(
      and(
        eq(invoices.companyId, companyId),
        ne(invoices.status, "void"),
        ne(invoices.status, "draft"),
        gte(invoices.issueDate, from),
        lte(invoices.issueDate, to),
      ),
    )
    .groupBy(invoices.clientId, clientDisplayNameSql)
    .orderBy(sql`sum(${invoices.grossPence}) desc`);

  const total = rows.reduce((acc, r) => acc + (r.total ?? 0), 0);
  if (total === 0) return [];

  const top = rows.slice(0, limit);
  const topSum = top.reduce((acc, r) => acc + (r.total ?? 0), 0);
  const other = total - topSum;

  const slices: ClientRevenueSlice[] = top.map((r) => ({
    clientId: r.clientId,
    name: r.name,
    grossPence: r.total ?? 0,
    grossFormatted: formatGBP(r.total ?? 0),
    percent: Math.round(((r.total ?? 0) / total) * 100),
  }));

  if (other > 0 && rows.length > limit) {
    slices.push({
      clientId: null,
      name: "Other",
      grossPence: other,
      grossFormatted: formatGBP(other),
      percent: Math.round((other / total) * 100),
    });
  }

  return slices;
}

async function getUnbilledOnActiveOrders(companyId: string): Promise<number> {
  const db = getDb();
  const active = await db
    .select({
      id: orders.id,
      grossPence: orders.grossPence,
    })
    .from(orders)
    .where(and(eq(orders.companyId, companyId), eq(orders.status, "active")));

  if (active.length === 0) return 0;

  const ids = active.map((o) => o.id);
  const billedRows = await db
    .select({
      orderId: invoices.orderId,
      total: sum(invoices.grossPence).mapWith(Number),
    })
    .from(invoices)
    .where(
      and(
        inArray(invoices.orderId, ids),
        ne(invoices.status, "void"),
        ne(invoices.status, "draft"),
      ),
    )
    .groupBy(invoices.orderId);

  const billedMap = new Map(
    billedRows
      .filter((r): r is { orderId: string; total: number } => r.orderId != null)
      .map((r) => [r.orderId, r.total ?? 0]),
  );

  let unbilled = 0;
  for (const order of active) {
    const billed = billedMap.get(order.id) ?? 0;
    unbilled += Math.max(0, order.grossPence - billed);
  }
  return unbilled;
}

async function getRecurringUpcoming(companyId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({
      lineTemplate: recurringInvoices.lineTemplate,
    })
    .from(recurringInvoices)
    .where(
      and(
        eq(recurringInvoices.companyId, companyId),
        eq(recurringInvoices.enabled, true),
      ),
    );

  let total = 0;
  for (const row of rows) {
    const lines = (row.lineTemplate as RecurringLineTemplate[]) ?? [];
    total += lines.reduce(
      (acc, l) => acc + Math.round(l.quantity * l.unitPricePence),
      0,
    );
  }
  return total;
}

async function getDaysSalesOutstanding(companyId: string): Promise<number | null> {
  const db = getDb();
  const paid = await db
    .select({
      id: invoices.id,
      issueDate: invoices.issueDate,
    })
    .from(invoices)
    .where(and(eq(invoices.companyId, companyId), eq(invoices.status, "paid")));

  if (paid.length === 0) return null;

  const ids = paid.map((i) => i.id);
  const lastPayments = await db
    .select({
      invoiceId: payments.invoiceId,
      lastReceived: sql<string>`max((${payments.receivedAt} AT TIME ZONE 'Europe/London')::date)`,
    })
    .from(payments)
    .where(inArray(payments.invoiceId, ids))
    .groupBy(payments.invoiceId);

  const lastMap = new Map(lastPayments.map((r) => [r.invoiceId, r.lastReceived]));

  let totalDays = 0;
  let count = 0;
  for (const inv of paid) {
    if (!inv.issueDate) continue;
    const paidOn = lastMap.get(inv.id);
    if (!paidOn) continue;
    const days = Math.max(
      0,
      Math.round(
        (new Date(`${paidOn}T12:00:00Z`).getTime() -
          new Date(`${inv.issueDate}T12:00:00Z`).getTime()) /
          (1000 * 60 * 60 * 24),
      ),
    );
    totalDays += days;
    count += 1;
  }

  if (count === 0) return null;
  return Math.round(totalDays / count);
}

async function getQuotePipelinePence(companyId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ total: sum(quotes.grossPence).mapWith(Number) })
    .from(quotes)
    .where(
      and(
        eq(quotes.companyId, companyId),
        inArray(quotes.status, ["draft", "sent", "accepted"]),
      ),
    );
  return row?.total ?? 0;
}

async function getActiveOrdersPence(companyId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ total: sum(orders.grossPence).mapWith(Number) })
    .from(orders)
    .where(and(eq(orders.companyId, companyId), eq(orders.status, "active")));
  return row?.total ?? 0;
}

function winRatePercent(quotesSummary: QuotesSummaryData): number | null {
  const accepted =
    quotesSummary.byStatus.find((s) => s.status === "accepted")?.count ?? 0;
  const declined = quotesSummary.declinedCount;
  const decided = accepted + declined;
  if (decided === 0) return null;
  return Math.round((accepted / decided) * 100);
}

function mergeCashSeries(
  months: string[],
  invoiced: Array<{ month: string; totalPence: number }>,
  collected: Array<{ month: string; totalPence: number }>,
  expenses: Array<{ month: string; totalPence: number }>,
  incomeNet: Array<{ month: string; totalPence: number }>,
): MonthlyCashPoint[] {
  const invoicedMap = new Map(invoiced.map((r) => [r.month, r.totalPence]));
  const collectedMap = new Map(collected.map((r) => [r.month, r.totalPence]));
  const expenseMap = new Map(expenses.map((r) => [r.month, r.totalPence]));
  const incomeMap = new Map(incomeNet.map((r) => [r.month, r.totalPence]));

  return months.map((month) => {
    const invoicedPence = invoicedMap.get(month) ?? 0;
    const collectedPence = collectedMap.get(month) ?? 0;
    const expensePence = expenseMap.get(month) ?? 0;
    const incomePence = incomeMap.get(month) ?? 0;
    const profitPence = incomePence - expensePence;
    return {
      month,
      label: formatMonthLabel(month),
      invoicedPence,
      collectedPence,
      incomePence,
      expensePence,
      profitPence,
      invoicedFormatted: formatGBP(invoicedPence),
      collectedFormatted: formatGBP(collectedPence),
      incomeFormatted: formatGBP(incomePence),
      expenseFormatted: formatGBP(expensePence),
      profitFormatted: formatGBP(profitPence),
    };
  });
}

function buildSparkline(
  series: MonthlyCashPoint[],
  key: "collectedPence" | "invoicedPence" | "profitPence",
): number[] {
  return series.map((p) => p[key]);
}

function todayDisplayLabel(today: string): string {
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export async function getDashboardOverview(
  companyId: string,
  user: SessionUser,
  periodRaw?: string | null,
): Promise<DashboardOverviewData> {
  const settings = await getCompanySettings(companyId);
  const periodKey = parseDashboardPeriod(periodRaw);
  const period = resolveDashboardPeriod(
    periodKey,
    settings.financialYearEndMonth,
  );
  const chartWindow = trailingChartMonths(12);
  const spendingPeriod = resolvePeriod(
    "current-month",
    settings.financialYearEndMonth,
  );

  const [
    invoiceKpis,
    overdueCount,
    owed,
    quotesSummary,
    ordersSummary,
    agedReceivables,
    reimbursable,
    unreconciledCount,
    pnl,
    priorPnl,
    collectedPence,
    priorCollectedPence,
    invoicedGrossPence,
    incomeByMonth,
    expenseByMonth,
    collectedByMonth,
    invoicedGrossByMonth,
    topClients,
    expenseByCategory,
    unbilledPence,
    recurringUpcomingPence,
    dsoDays,
    spendingSummary,
    spendingSeries,
    overdueInvoices,
    expiringQuotes,
    pendingExpenses,
    inboundEmailIssues,
    quotePipelinePence,
    activeOrdersPence,
  ] = await Promise.all([
    getDashboardKpis(companyId),
    countOverdueInvoices(companyId),
    getOwedSummary(companyId, user),
    getQuotesSummary(companyId, {}),
    getOrdersSummary(companyId),
    getAgedReceivables(companyId),
    getReimbursableSummary(companyId),
    countUnreconciledBankTransactions(companyId),
    getProfitAndLoss(companyId, period.from, period.to),
    getProfitAndLoss(companyId, period.compareFrom, period.compareTo),
    getCollectedInPeriod(companyId, period.from, period.to),
    getCollectedInPeriod(companyId, period.compareFrom, period.compareTo),
    getInvoicedGrossInPeriod(companyId, period.from, period.to),
    getIncomeByMonth(companyId, chartWindow.from, chartWindow.to),
    getExpenseByMonth(companyId, chartWindow.from, chartWindow.to),
    getCollectedByMonth(companyId, chartWindow.from, chartWindow.to),
    getInvoicedGrossByMonth(companyId, chartWindow.from, chartWindow.to),
    getTopClientsByRevenue(companyId, period.from, period.to),
    getExpenseByCategory(companyId, period.from, period.to),
    getUnbilledOnActiveOrders(companyId),
    getRecurringUpcoming(companyId),
    getDaysSalesOutstanding(companyId),
    getSpendingSummary(companyId, {
      from: spendingPeriod.from,
      to: spendingPeriod.to,
      compareFrom: spendingPeriod.compareFrom,
      compareTo: spendingPeriod.compareTo,
    }),
    getSpendingSeries(companyId, {
      from: spendingPeriod.from,
      to: spendingPeriod.to,
      compareFrom: spendingPeriod.compareFrom,
      compareTo: spendingPeriod.compareTo,
      buckets: spendingPeriod.buckets,
    }),
    listOverdueInvoices(companyId, 5),
    listExpiringQuotes(companyId, 5),
    listPendingExpenses(companyId, 5),
    can(user.role, "users:manage")
      ? listInboundEmailIssues(companyId, 5)
      : Promise.resolve([]),
    getQuotePipelinePence(companyId),
    getActiveOrdersPence(companyId),
  ]);

  const cashSeries = mergeCashSeries(
    chartWindow.months,
    invoicedGrossByMonth,
    collectedByMonth,
    expenseByMonth,
    incomeByMonth,
  );

  const collectedDelta = formatDeltaPercent(collectedPence, priorCollectedPence);
  const profitDelta = formatDeltaPercent(pnl.profitPence, priorPnl.profitPence);

  const overduePercentOfAr =
    invoiceKpis.outstandingPence > 0
      ? Math.round(
          (invoiceKpis.overduePence / invoiceKpis.outstandingPence) * 100,
        )
      : null;

  const totalPipelinePence = quotePipelinePence + activeOrdersPence;
  const winRate = winRatePercent(quotesSummary);

  const expenseTotal = expenseByCategory.reduce((a, r) => a + r.totalPence, 0);
  const expenseMix: ExpenseCategorySlice[] = expenseByCategory
    .slice(0, 6)
    .map((row) => ({
      category: row.category,
      totalPence: row.totalPence,
      totalFormatted: row.totalFormatted,
      percent:
        expenseTotal > 0
          ? Math.round((row.totalPence / expenseTotal) * 100)
          : 0,
    }));

  const heroes: HeroKpi[] = [
    {
      key: "collected",
      title: "Collected",
      value: formatGBP(collectedPence),
      valuePence: collectedPence,
      href: "/invoices",
      subtitle: period.label,
      insight:
        invoicedGrossPence > 0
          ? `${formatGBP(invoicedGrossPence)} invoiced · ${Math.round((collectedPence / Math.max(invoicedGrossPence, 1)) * 100)}% of invoiced`
          : "No invoices issued in this period",
      delta: {
        ...collectedDelta,
        caption: `vs ${period.compareLabel}`,
      },
      sparkline: buildSparkline(cashSeries, "collectedPence"),
    },
    {
      key: "outstanding",
      title: "Outstanding",
      value: invoiceKpis.outstandingFormatted,
      valuePence: invoiceKpis.outstandingPence,
      href: "/invoices",
      subtitle:
        overdueCount > 0
          ? `${overdueCount} overdue · ${invoiceKpis.overdueFormatted}`
          : "Nothing overdue",
      insight:
        overduePercentOfAr != null
          ? `${overduePercentOfAr}% of AR is overdue${dsoDays != null ? ` · DSO ${dsoDays} days` : ""}`
          : dsoDays != null
            ? `Average DSO ${dsoDays} days`
            : "No receivables due",
      delta: {
        percent: null,
        label: "Open",
        direction: "flat",
        caption: "current balance",
      },
      sparkline: buildSparkline(cashSeries, "invoicedPence"),
      accent: overdueCount > 0 ? "destructive" : "default",
    },
    {
      key: "profit",
      title: "Profit",
      value: pnl.profitFormatted,
      valuePence: pnl.profitPence,
      href: "/reports",
      subtitle: `${pnl.incomeFormatted} income · ${pnl.expenseFormatted} expenses`,
      insight: "Accrual · invoiced net less expenses",
      delta: {
        ...profitDelta,
        caption: `vs ${period.compareLabel}`,
      },
      sparkline: buildSparkline(cashSeries, "profitPence"),
    },
    {
      key: "pipeline",
      title: "Pipeline",
      value: formatGBP(totalPipelinePence),
      valuePence: totalPipelinePence,
      href: "/quotes",
      subtitle: `${quotesSummary.pipelineCount} quotes · ${ordersSummary.activeCount} orders`,
      insight:
        unbilledPence > 0
          ? `${formatGBP(unbilledPence)} unbilled on active orders`
          : winRate != null
            ? `${winRate}% quote win rate`
            : recurringUpcomingPence > 0
              ? `${formatGBP(recurringUpcomingPence)} recurring next run`
              : "No open pipeline yet",
      delta: {
        percent: null,
        label: winRate != null ? `${winRate}% win` : "Open",
        direction: "flat",
        caption: "quote → order",
      },
      sparkline: cashSeries.map(() => totalPipelinePence),
    },
  ];

  const funnel: FunnelStage[] = [
    {
      key: "quotes",
      label: "Open quotes",
      valuePence: quotePipelinePence,
      valueFormatted: formatGBP(quotePipelinePence),
      href: "/quotes",
    },
    {
      key: "orders",
      label: "Active orders",
      valuePence: activeOrdersPence,
      valueFormatted: formatGBP(activeOrdersPence),
      href: "/orders",
    },
    {
      key: "invoiced",
      label: "Invoiced",
      valuePence: invoicedGrossPence,
      valueFormatted: formatGBP(invoicedGrossPence),
      href: "/invoices",
    },
    {
      key: "collected",
      label: "Collected",
      valuePence: collectedPence,
      valueFormatted: formatGBP(collectedPence),
      href: "/invoices",
    },
  ];

  const agedOverdue =
    agedReceivables.raw.d30 +
    agedReceivables.raw.d60 +
    agedReceivables.raw.d90;
  const agedTotal = agedReceivables.raw.current + agedOverdue;
  const agedOverduePercent =
    agedTotal > 0 ? Math.round((agedOverdue / agedTotal) * 100) : null;

  return {
    periodKey,
    periodLabel: period.label,
    compareLabel: period.compareLabel,
    todayLabel: todayDisplayLabel(todayIsoDate()),
    heroes,
    cashSeries,
    incomeExpenseSeries: cashSeries,
    funnel,
    agedReceivables: {
      ...agedReceivables,
      overduePercent: agedOverduePercent,
    },
    topClients,
    expenseMix,
    spending: {
      summary: spendingSummary,
      series: spendingSeries,
      periodLabel: spendingPeriod.label,
      compareLabel: spendingPeriod.compareLabel,
      buckets: spendingPeriod.buckets,
    },
    attention: {
      overdueInvoices,
      expiringQuotes,
      unreconciledCount,
      pendingExpenses,
      inboundEmailIssues,
      reimbursableFormatted: reimbursable.totalFormatted,
      owedToMeFormatted: owed.owedToMeFormatted,
      owedToCofoundersFormatted: owed.owedToCofoundersFormatted,
      winRatePercent: winRate,
      unbilledFormatted: formatGBP(unbilledPence),
      recurringUpcomingFormatted: formatGBP(recurringUpcomingPence),
      dsoDays,
      overduePercentOfAr,
    },
    quotesSummary,
    ordersSummary,
    insights: {
      invoicedFormatted: formatGBP(invoicedGrossPence),
      collectedFormatted: formatGBP(collectedPence),
      winRatePercent: winRate,
      unbilledFormatted: formatGBP(unbilledPence),
      recurringUpcomingFormatted: formatGBP(recurringUpcomingPence),
      dsoDays,
    },
  };
}

/** @deprecated Prefer HeroKpi — kept for migration. */
export type DashboardKpiGroup = {
  label: string;
  items: Array<{
    title: string;
    value: string;
    subtitle?: string;
    href: string;
    accent?: "default" | "destructive" | "brand";
  }>;
};

/** @deprecated Use MonthlyCashPoint */
export type MonthlyIncomeExpensePoint = {
  month: string;
  label: string;
  incomePence: number;
  expensePence: number;
  profitPence: number;
  incomeFormatted: string;
  expenseFormatted: string;
  profitFormatted: string;
};
