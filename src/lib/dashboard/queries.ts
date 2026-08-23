import "server-only";
import type { SessionUser } from "@/lib/auth";
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
import { getOrdersSummary, type OrdersSummaryData } from "@/lib/orders/summary";
import { getOwedSummary } from "@/lib/reimbursements/queries";
import {
  getQuotesSummary,
  listExpiringQuotes,
  type ExpiringQuoteRow,
  type QuotesSummaryData,
} from "@/lib/quotes/summary";
import type { QuoteStatus } from "@/lib/quotes/status";
import { can } from "@/lib/roles";
import {
  defaultReportPeriod,
  getAgedReceivables,
  getExpenseByMonth,
  getIncomeByMonth,
  getProfitAndLoss,
} from "@/lib/reports/queries";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import {
  getSpendingSeries,
  getSpendingSummary,
  type SpendingSummary,
} from "@/lib/spending/queries";
import type { SpendingSeriesPoint } from "@/lib/spending/series";
import { formatGBP } from "@/lib/money";

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

export type QuoteStatusSlice = {
  status: QuoteStatus;
  label: string;
  count: number;
  grossFormatted: string;
  percent: number;
};

export type DashboardAttentionData = {
  overdueInvoices: OverdueInvoiceRow[];
  expiringQuotes: ExpiringQuoteRow[];
  unreconciledCount: number;
  pendingExpenses: Awaited<ReturnType<typeof listPendingExpenses>>;
  inboundEmailIssues: Awaited<ReturnType<typeof listInboundEmailIssues>>;
};

export type DashboardOverviewData = {
  kpis: DashboardKpiGroup[];
  incomeExpenseSeries: MonthlyIncomeExpensePoint[];
  agedReceivables: {
    current: string;
    d30: string;
    d60: string;
    d90: string;
    raw: { current: number; d30: number; d60: number; d90: number };
  };
  quoteStatusBreakdown: QuoteStatusSlice[];
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
  fyLabel: string;
};

function trailingMonthsRange(
  monthCount: number,
  today = todayIsoDate(),
): { from: string; to: string; months: string[] } {
  const [y, m] = today.split("-").map(Number);
  const months: string[] = [];
  for (let i = monthCount - 1; i >= 0; i--) {
    let month = m - i;
    let year = y;
    while (month <= 0) {
      month += 12;
      year -= 1;
    }
    months.push(`${year}-${String(month).padStart(2, "0")}`);
  }
  return { from: `${months[0]!}-01`, to: today, months };
}

function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, 1)).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function mergeIncomeExpenseSeries(
  months: string[],
  income: Awaited<ReturnType<typeof getIncomeByMonth>>,
  expense: Awaited<ReturnType<typeof getExpenseByMonth>>,
): MonthlyIncomeExpensePoint[] {
  const incomeMap = new Map(income.map((row) => [row.month, row.totalPence]));
  const expenseMap = new Map(expense.map((row) => [row.month, row.totalPence]));

  return months.map((month) => {
    const incomePence = incomeMap.get(month) ?? 0;
    const expensePence = expenseMap.get(month) ?? 0;
    const profitPence = incomePence - expensePence;
    return {
      month,
      label: formatMonthLabel(month),
      incomePence,
      expensePence,
      profitPence,
      incomeFormatted: formatGBP(incomePence),
      expenseFormatted: formatGBP(expensePence),
      profitFormatted: formatGBP(profitPence),
    };
  });
}

function buildQuoteStatusBreakdown(summary: QuotesSummaryData): QuoteStatusSlice[] {
  const total = summary.byStatus.reduce((acc, row) => acc + row.count, 0);
  if (total === 0) return [];
  return summary.byStatus.map((row) => ({
    status: row.status,
    label: row.label,
    count: row.count,
    grossFormatted: row.grossFormatted,
    percent: Math.round((row.count / total) * 100),
  }));
}

function buildKpiGroups(input: {
  invoiceKpis: Awaited<ReturnType<typeof getDashboardKpis>>;
  overdueCount: number;
  quotes: QuotesSummaryData;
  orders: OrdersSummaryData;
  pnl: Awaited<ReturnType<typeof getProfitAndLoss>>;
  unreconciledCount: number;
  reimbursable: Awaited<ReturnType<typeof getReimbursableSummary>>;
  owed: Awaited<ReturnType<typeof getOwedSummary>>;
  fyLabel: string;
}): DashboardKpiGroup[] {
  return [
    {
      label: "Receivables",
      items: [
        {
          title: "Outstanding",
          value: input.invoiceKpis.outstandingFormatted,
          href: "/dashboard/invoices",
        },
        {
          title: "Overdue",
          value: input.invoiceKpis.overdueFormatted,
          subtitle:
            input.overdueCount > 0
              ? `${input.overdueCount} invoice${input.overdueCount === 1 ? "" : "s"}`
              : undefined,
          href: "/dashboard/invoices",
          accent: input.overdueCount > 0 ? "destructive" : "default",
        },
        {
          title: "Invoiced this month",
          value: input.invoiceKpis.invoicedThisMonthFormatted,
          href: "/dashboard/invoices",
        },
      ],
    },
    {
      label: "Pipeline",
      items: [
        {
          title: "Quote pipeline",
          value: input.quotes.pipelineGrossFormatted,
          subtitle: `${input.quotes.pipelineCount} quote${input.quotes.pipelineCount === 1 ? "" : "s"}`,
          href: "/dashboard/quotes",
        },
        {
          title: "Active orders",
          value: input.orders.activeGrossFormatted,
          subtitle: `${input.orders.activeCount} order${input.orders.activeCount === 1 ? "" : "s"}`,
          href: "/dashboard/orders",
        },
        {
          title: "Expiring within 30 days",
          value: String(input.quotes.expiringSoonCount),
          subtitle: "open quotes",
          href: "/dashboard/quotes",
          accent: input.quotes.expiringSoonCount > 0 ? "brand" : "default",
        },
      ],
    },
    {
      label: "Cash",
      items: [
        {
          title: `Profit (${input.fyLabel})`,
          value: input.pnl.profitFormatted,
          subtitle: `${input.pnl.incomeFormatted} income · ${input.pnl.expenseFormatted} expenses`,
          href: "/dashboard/reports",
        },
        {
          title: "Unreconciled",
          value: String(input.unreconciledCount),
          subtitle: "bank transactions",
          href: "/dashboard/transactions",
          accent: input.unreconciledCount > 0 ? "brand" : "default",
        },
        {
          title: "Reimbursable",
          value: input.reimbursable.totalFormatted,
          subtitle: `${input.reimbursable.count} expense${input.reimbursable.count === 1 ? "" : "s"}`,
          href: "/dashboard/expenses",
        },
      ],
    },
    {
      label: "Founders",
      items: [
        {
          title: "Owed to me",
          value: input.owed.owedToMeFormatted,
          href: "/dashboard/reimbursements",
        },
        {
          title: "Owed to co-founders",
          value: input.owed.owedToCofoundersFormatted,
          href: "/dashboard/reimbursements",
        },
      ],
    },
  ];
}

export async function getDashboardOverview(
  user: SessionUser,
): Promise<DashboardOverviewData> {
  const settings = await getOrCreateCompanySettings();
  const trailing = trailingMonthsRange(6);
  const spendingPeriod = resolvePeriod("current-month", settings.financialYearEndMonth);
  const fyPeriod = await defaultReportPeriod();

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
    incomeByMonth,
    expenseByMonth,
    spendingSummary,
    spendingSeries,
    overdueInvoices,
    expiringQuotes,
    pendingExpenses,
    inboundEmailIssues,
  ] = await Promise.all([
    getDashboardKpis(),
    countOverdueInvoices(),
    getOwedSummary(user),
    getQuotesSummary({}),
    getOrdersSummary(),
    getAgedReceivables(),
    getReimbursableSummary(),
    countUnreconciledBankTransactions(),
    getProfitAndLoss(fyPeriod.from, fyPeriod.to),
    getIncomeByMonth(trailing.from, trailing.to),
    getExpenseByMonth(trailing.from, trailing.to),
    getSpendingSummary({
      from: spendingPeriod.from,
      to: spendingPeriod.to,
      compareFrom: spendingPeriod.compareFrom,
      compareTo: spendingPeriod.compareTo,
    }),
    getSpendingSeries({
      from: spendingPeriod.from,
      to: spendingPeriod.to,
      compareFrom: spendingPeriod.compareFrom,
      compareTo: spendingPeriod.compareTo,
      buckets: spendingPeriod.buckets,
    }),
    listOverdueInvoices(5),
    listExpiringQuotes(5),
    listPendingExpenses(5),
    can(user.role, "users:manage") ? listInboundEmailIssues(5) : Promise.resolve([]),
  ]);

  const fyLabel = "FY";

  return {
    kpis: buildKpiGroups({
      invoiceKpis,
      overdueCount,
      quotes: quotesSummary,
      orders: ordersSummary,
      pnl,
      unreconciledCount,
      reimbursable,
      owed,
      fyLabel,
    }),
    incomeExpenseSeries: mergeIncomeExpenseSeries(
      trailing.months,
      incomeByMonth,
      expenseByMonth,
    ),
    agedReceivables,
    quoteStatusBreakdown: buildQuoteStatusBreakdown(quotesSummary),
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
    },
    quotesSummary,
    ordersSummary,
    fyLabel,
  };
}
