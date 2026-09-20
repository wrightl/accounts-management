import Link from "next/link";
import { AgedReceivablesChart } from "@/components/dashboard/aged-receivables-chart";
import { AttentionPanel } from "@/components/dashboard/attention-panel";
import { CashVsInvoicedChart } from "@/components/dashboard/cash-vs-invoiced-chart";
import { ExpenseMixChart } from "@/components/dashboard/expense-mix-chart";
import { HeroKpis } from "@/components/dashboard/hero-kpis";
import { IncomeExpenseChart } from "@/components/dashboard/income-expense-chart";
import { PeriodChips } from "@/components/dashboard/period-chips";
import { QuoteToCashFunnel } from "@/components/dashboard/quote-to-cash-funnel";
import { SpendingSnapshot } from "@/components/dashboard/spending-snapshot";
import { TopClientsChart } from "@/components/dashboard/top-clients-chart";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { getDashboardOverview } from "@/lib/dashboard/queries";
import { reportError } from "@/lib/errors/report";

export default async function DashboardOverview({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;

  if (user.role === "pending") {
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold">
          Welcome{user.name ? `, ${user.name.split(" ")[0]}` : ""}
        </h1>
        <p className="mt-2 text-muted">
          Your account is waiting for an administrator to assign a role in Clerk
          (admin, co-founder, or accountant). You cannot view or change the books
          until then.
        </p>
      </div>
    );
  }

  let overview: Awaited<ReturnType<typeof getDashboardOverview>> | null = null;
  let loadError: string | null = null;

  if (!can(user.role, "accounts:read")) {
    loadError = "no_permission";
  } else if (!user.companyId) {
    loadError = "no_company";
  } else {
    try {
      overview = await getDashboardOverview(user.companyId, user, sp.period);
    } catch (err) {
      loadError = "query_failed";
      console.warn(
        JSON.stringify({
          level: "warn",
          msg: "dashboard_overview_failed",
          error: err instanceof Error ? err.message : String(err),
          cause:
            err instanceof Error && "cause" in err
              ? String((err as { cause?: unknown }).cause)
              : undefined,
        }),
      );
      void reportError({
        source: "dashboard.overview",
        error: err,
        companyId: user.companyId,
        actorUserId: user.localUserId,
      });
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">
            Welcome{user.name ? `, ${user.name.split(" ")[0]}` : ""}
          </h1>
          <p className="mt-1 text-muted">
            {overview ? overview.todayLabel : "Business overview"}
            {" · "}
            <Link
              href="/help"
              className="text-navy underline decoration-navy/30 underline-offset-2 hover:decoration-navy"
            >
              How to use this app
            </Link>
          </p>
        </div>
        {overview ? <PeriodChips current={overview.periodKey} /> : null}
      </div>

      {!overview ? (
        <p className="mt-6 text-sm text-muted">
          {loadError === "no_permission"
            ? "Your role cannot view dashboard metrics."
            : loadError === "no_company"
              ? "Complete onboarding to view dashboard metrics."
              : loadError === "query_failed"
                ? "Dashboard metrics could not be loaded. Refresh the page, or check /platform logs if this keeps happening."
                : "Dashboard metrics are unavailable."}
        </p>
      ) : (
        <>
          <HeroKpis heroes={overview.heroes} />

          <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                <CashVsInvoicedChart data={overview.cashSeries} />
                <QuoteToCashFunnel
                  stages={overview.funnel}
                  periodLabel={overview.periodLabel}
                />
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <AgedReceivablesChart
                  raw={overview.agedReceivables.raw}
                  formatted={{
                    current: overview.agedReceivables.current,
                    d30: overview.agedReceivables.d30,
                    d60: overview.agedReceivables.d60,
                    d90: overview.agedReceivables.d90,
                  }}
                  overduePercent={overview.agedReceivables.overduePercent}
                />
                <IncomeExpenseChart data={overview.incomeExpenseSeries} />
              </div>

              <div className="grid gap-6 lg:grid-cols-3">
                <TopClientsChart
                  clients={overview.topClients}
                  periodLabel={overview.periodLabel}
                />
                <ExpenseMixChart
                  slices={overview.expenseMix}
                  periodLabel={overview.periodLabel}
                />
                <SpendingSnapshot
                  summary={overview.spending.summary}
                  series={overview.spending.series}
                  periodLabel={overview.spending.periodLabel}
                  compareLabel={overview.spending.compareLabel}
                  buckets={overview.spending.buckets}
                />
              </div>
            </div>

            <AttentionPanel items={overview.attention} />
          </section>
        </>
      )}
    </div>
  );
}
