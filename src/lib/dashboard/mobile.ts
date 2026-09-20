import type { DashboardOverviewData } from "@/lib/dashboard/queries";

export type MobileDashboardPayload = ReturnType<typeof toMobileDashboard>;

export function firstNameFrom(name: string | null | undefined): string {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0] ?? "";
}

/** JSON-stable subset of the web overview for the Flutter app. */
export function toMobileDashboard(
  overview: DashboardOverviewData,
  extras: { role: string; firstName: string },
) {
  return {
    role: extras.role,
    firstName: extras.firstName,
    periodKey: overview.periodKey,
    periodLabel: overview.periodLabel,
    compareLabel: overview.compareLabel,
    todayLabel: overview.todayLabel,
    heroes: overview.heroes.map((hero) => ({
      key: hero.key,
      title: hero.title,
      value: hero.value,
      valuePence: hero.valuePence,
      subtitle: hero.subtitle ?? null,
      insight: hero.insight ?? null,
      accent: hero.accent ?? "default",
      delta: hero.delta,
      sparkline: hero.sparkline,
    })),
    cashSeries: overview.cashSeries,
    funnel: overview.funnel.map((stage) => ({
      key: stage.key,
      label: stage.label,
      valuePence: stage.valuePence,
      valueFormatted: stage.valueFormatted,
    })),
    agedReceivables: overview.agedReceivables,
    topClients: overview.topClients,
    expenseMix: overview.expenseMix,
    spending: {
      summary: {
        totalPence: overview.spending.summary.totalPence,
        compareTotalPence: overview.spending.summary.compareTotalPence,
        totalFormatted: overview.spending.summary.totalFormatted,
        compareTotalFormatted: overview.spending.summary.compareTotalFormatted,
        trend: overview.spending.summary.trend,
      },
      series: overview.spending.series,
      periodLabel: overview.spending.periodLabel,
      compareLabel: overview.spending.compareLabel,
    },
    attention: {
      overdueInvoices: overview.attention.overdueInvoices,
      expiringQuotes: overview.attention.expiringQuotes,
      unreconciledCount: overview.attention.unreconciledCount,
      pendingExpenses: overview.attention.pendingExpenses.map((expense) => ({
        id: expense.id,
        description: expense.description,
        submitterLabel: expense.submitterLabel,
        amountFormatted: expense.amountFormatted,
      })),
      inboundEmailIssues: overview.attention.inboundEmailIssues.map((job) => ({
        id: job.id,
        subject: job.subject,
        fromEmail: job.fromEmail,
        attempts: job.attempts,
        lastError: job.lastError,
      })),
      reimbursableFormatted: overview.attention.reimbursableFormatted,
      owedToMeFormatted: overview.attention.owedToMeFormatted,
      winRatePercent: overview.attention.winRatePercent,
      unbilledFormatted: overview.attention.unbilledFormatted,
      recurringUpcomingFormatted: overview.attention.recurringUpcomingFormatted,
      dsoDays: overview.attention.dsoDays,
    },
  };
}
