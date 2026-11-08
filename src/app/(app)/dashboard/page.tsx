import Link from "next/link";
import { redirect } from "next/navigation";
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
import { getSafeToPay } from "@/lib/safe-to-pay/queries";
import { formatGBP } from "@/lib/money";
import { Card, CardTitle, CardValue } from "@/components/ui/card";
import { MenuSuggestionCard } from "@/components/menu/menu-suggestion-card";
import { MenuQuestionsCard } from "@/components/menu/menu-questions-card";
import { bundlesFor } from "@/lib/menu/features";
import {
  NAV_GROUPS,
  flattenNavItems,
  hiddenNavGroups,
} from "@/components/dashboard/nav";
import { getMenuState } from "@/lib/menu/queries";
import { aiGatewayConfigured } from "@/lib/ai/models";
import { getMenuSuggestions, type MenuSuggestion } from "@/lib/menu/suggestions";
import { DisplayDate } from "@/components/date-format-provider";
import { getDateFormat } from "@/lib/date-format.server";
import { todayIsoDate } from "@/lib/dates";
import { DataOnboardingCard } from "@/components/data-onboarding/data-onboarding-card";
import { getDataOnboarding, type DataOnboardingView } from "@/lib/data-onboarding/queries";
import { stepsFor } from "@/lib/data-onboarding/steps";

type MenuPrompt =
  | { kind: "questions" }
  | { kind: "suggestion"; suggestion: MenuSuggestion; labels: string[] };

/**
 * The menu questions for someone who never answered them (an invited member),
 * otherwise the first suggestion to add a hidden page, based on the business's
 * data.
 */
async function loadMenuPrompt(
  user: Awaited<ReturnType<typeof requireUser>>,
): Promise<MenuPrompt | null> {
  if (!user.companyId || !user.localUserId) return null;
  const state = await getMenuState(user.localUserId, user.companyId);
  if (state.enabled === null) return { kind: "questions" };
  const hiddenItems = flattenNavItems(
    hiddenNavGroups(NAV_GROUPS, {
      permissionCheck: (permission) => can(user.role, permission),
      entityType: user.entityType,
      aiAvailable: aiGatewayConfigured(),
      enabledFeatures: state.enabled,
    }),
  );
  const [suggestion] = await getMenuSuggestions(user.companyId, {
    hidden: hiddenItems.flatMap((item) => (item.feature ? [item.feature] : [])),
    dismissed: state.dismissed,
  });
  if (!suggestion) return null;
  const labels = hiddenItems
    .filter((item) => item.feature && suggestion.features.includes(item.feature))
    .map((item) => item.label);
  return { kind: "suggestion", suggestion, labels };
}

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

  // The Overview is built from day-to-day records; accountants start at Reports.
  if (!can(user.role, "accounts:read") && can(user.role, "filing:read")) {
    redirect("/reports");
  }

  let overview: Awaited<ReturnType<typeof getDashboardOverview>> | null = null;
  let loadError: string | null = null;
  let safeToPay: Awaited<ReturnType<typeof getSafeToPay>> | null = null;
  let menuPrompt: MenuPrompt | null = null;

  if (!can(user.role, "accounts:read")) {
    loadError = "no_permission";
  } else if (!user.companyId) {
    loadError = "no_company";
  } else {
    try {
      overview = await getDashboardOverview(user.companyId, user, sp.period);
      if (user.entityType === "limited_company" && can(user.role, "reports:read")) {
        // Secondary figure: never let it break the dashboard.
        safeToPay = await getSafeToPay(user.companyId, undefined, await getDateFormat()).catch(() => null);
      }
      // Secondary too: a failed suggestion must not break the dashboard.
      menuPrompt = await loadMenuPrompt(user).catch(() => null);
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

  // Shown even when the overview fails: new companies have the least to show.
  const canWrite = can(user.role, "accounts:write");
  let dataOnboarding: DataOnboardingView | null = null;
  if (user.companyId && can(user.role, "accounts:read")) {
    dataOnboarding = await getDataOnboarding(
      user.companyId,
      user.entityType,
      await getDateFormat(),
    ).catch((err) => {
      void reportError({
        source: "dashboard.data_onboarding",
        error: err,
        companyId: user.companyId,
        actorUserId: user.localUserId,
      });
      return null;
    });
  }
  const showDataOnboarding =
    dataOnboarding !== null &&
    (dataOnboarding.status === "active" ||
      dataOnboarding.status === "paused" ||
      (dataOnboarding.status === "not_started" && canWrite));

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">
            Welcome{user.name ? `, ${user.name.split(" ")[0]}` : ""}
          </h1>
          <p className="mt-1 text-muted">
            {overview ? <DisplayDate value={todayIsoDate()} /> : "Business overview"}
            {" · "}
            <Link
              href="/help"
              className="text-navy underline decoration-navy/30 underline-offset-2 hover:decoration-navy"
            >
              How to use this app
            </Link>
          </p>
        </div>
        {overview ? <PeriodChips current={overview.periodKey} pastYears={overview.pastYears} /> : null}
      </div>

      {showDataOnboarding && dataOnboarding ? (
        <DataOnboardingCard
          view={dataOnboarding}
          canWrite={canWrite}
          allowedSteps={stepsFor(user.entityType)
            .filter((step) => can(user.role, step.permission))
            .map((step) => step.id)}
          today={todayIsoDate()}
        />
      ) : null}

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
          {menuPrompt?.kind === "questions" ? (
            <MenuQuestionsCard bundles={bundlesFor(user.entityType)} />
          ) : menuPrompt?.kind === "suggestion" ? (
            <MenuSuggestionCard
              suggestion={menuPrompt.suggestion}
              labels={menuPrompt.labels}
            />
          ) : null}
          <HeroKpis heroes={overview.heroes} />

          <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                <CashVsInvoicedChart
                  data={overview.cashSeries}
                  windowLabel={overview.chartWindowLabel}
                />
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
                <IncomeExpenseChart
                  data={overview.incomeExpenseSeries}
                  windowLabel={overview.chartWindowLabel}
                />
              </div>

              <div className="grid gap-6 lg:grid-cols-3">
                <TopClientsChart
                  clients={overview.topClients}
                  periodLabel={overview.periodLabel}
                  includesPreCutover={overview.periodBeforeCutover}
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

            <div className="space-y-6">
              {safeToPay ? (
                <Card>
                  <CardTitle>Safe to pay yourself</CardTitle>
                  <CardValue>{formatGBP(safeToPay.result.safeNowPence)}</CardValue>
                  <p className="mt-1 text-xs text-muted">
                    {safeToPay.cash.known
                      ? `${formatGBP(safeToPay.result.safeLaterPence)} in 30 days if clients pay on time.`
                      : "Import a bank statement to work this out."}{" "}
                    <Link href="/safe-to-pay" className="underline">
                      How it&apos;s worked out
                    </Link>
                  </p>
                </Card>
              ) : null}
              <AttentionPanel items={overview.attention} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
