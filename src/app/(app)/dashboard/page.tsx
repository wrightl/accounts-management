import Link from "next/link";
import { AgedReceivablesChart } from "@/components/dashboard/aged-receivables-chart";
import { AttentionPanel } from "@/components/dashboard/attention-panel";
import { IncomeExpenseChart } from "@/components/dashboard/income-expense-chart";
import { KpiGrid } from "@/components/dashboard/kpi-grid";
import { SpendingSnapshot } from "@/components/dashboard/spending-snapshot";
import { StatusDonutChart } from "@/components/dashboard/status-donut-chart";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { getDashboardOverview } from "@/lib/dashboard/queries";
import type { QuoteStatus } from "@/lib/quotes/status";
import { reportError } from "@/lib/errors/report";

const QUOTE_STATUS_COLORS: Record<QuoteStatus, string> = {
  draft: "var(--muted)",
  sent: "var(--periwinkle)",
  accepted: "var(--navy)",
  declined: "var(--destructive)",
};

export default async function DashboardOverview() {
  const user = await requireUser();

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
      overview = await getDashboardOverview(user.companyId, user);
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
      <h1 className="font-display text-2xl font-semibold">
        Welcome{user.name ? `, ${user.name.split(" ")[0]}` : ""}
      </h1>
      <p className="mt-1 text-muted">
        Business overview — receivables, pipeline, cash, and items needing
        action.{" "}
        <Link
          href="/help"
          className="text-navy underline decoration-navy/30 underline-offset-2 hover:decoration-navy"
        >
          How to use this app
        </Link>
      </p>

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
          <KpiGrid groups={overview.kpis} />

          <section className="mt-10 grid gap-6 lg:grid-cols-2">
            <IncomeExpenseChart data={overview.incomeExpenseSeries} />
            <AgedReceivablesChart
              raw={overview.agedReceivables.raw}
              formatted={{
                current: overview.agedReceivables.current,
                d30: overview.agedReceivables.d30,
                d60: overview.agedReceivables.d60,
                d90: overview.agedReceivables.d90,
              }}
            />
            <StatusDonutChart
              title="Quote pipeline"
              subtitle="By status"
              slices={overview.quoteStatusBreakdown.map((row) => ({
                key: row.status,
                label: row.label,
                count: row.count,
                grossFormatted: row.grossFormatted,
                percent: row.percent,
                color: QUOTE_STATUS_COLORS[row.status],
              }))}
            />
            <SpendingSnapshot
              summary={overview.spending.summary}
              series={overview.spending.series}
              periodLabel={overview.spending.periodLabel}
              compareLabel={overview.spending.compareLabel}
              buckets={overview.spending.buckets}
            />
          </section>

          <AttentionPanel items={overview.attention} className="mt-10" />
        </>
      )}
    </div>
  );
}
