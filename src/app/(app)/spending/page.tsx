import Link from "next/link";
import { guardTenantPage } from "@/lib/auth";
import { isPeriodPreset, resolvePeriod } from "@/lib/dates";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import {
  getSpendingSeries,
  getSpendingSummary,
  getTopSpending,
  hasSpendingOutflows,
} from "@/lib/spending/queries";
import { SpendingChart } from "@/components/spending/spending-chart";
import {
  BreakdownChips,
  PeriodChips,
  SpendingTrendSummary,
} from "@/components/spending/spending-ui";
import { buttonClasses } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { isDatabaseConfigured } from "@/env";

export default async function SpendingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { companyId } = await guardTenantPage("accounts:read");
  const sp = await searchParams;

  if (!isDatabaseConfigured()) {
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold">Spending</h1>
        <p className="mt-2 text-muted">Connect a database to view spending.</p>
      </div>
    );
  }

  const settings = await getOrCreateCompanySettings(companyId);
  const periodParam = sp.period ?? "current-month";
  const period = isPeriodPreset(periodParam) ? periodParam : "current-month";
  const breakdown = sp.breakdown === "merchant" ? "merchant" : "category";

  const resolved = resolvePeriod(period, settings.financialYearEndMonth, {
    from: sp.from,
    to: sp.to,
  });

  const [summary, series, topRows, hasData] = await Promise.all([
    getSpendingSummary(companyId, {
      from: resolved.from,
      to: resolved.to,
      compareFrom: resolved.compareFrom,
      compareTo: resolved.compareTo,
    }),
    getSpendingSeries(companyId, {
      from: resolved.from,
      to: resolved.to,
      compareFrom: resolved.compareFrom,
      compareTo: resolved.compareTo,
      buckets: resolved.buckets,
    }),
    getTopSpending(companyId, {
      from: resolved.from,
      to: resolved.to,
      groupBy: breakdown,
      limit: 10,
    }),
    hasSpendingOutflows(companyId, resolved.from, resolved.to),
  ]);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Spending</h1>
          <p className="mt-1 text-muted">
            Cash outflows from your bank import — {resolved.label}.
          </p>
        </div>
        <Link href="/transactions" className={buttonClasses("secondary")}>
          Import CSV
        </Link>
      </div>

      <div className="mt-6">
        <PeriodChips
          period={period}
          breakdown={breakdown}
          customFrom={resolved.from}
          customTo={resolved.to}
        />
      </div>

      {!hasData ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border bg-surface p-8 text-center">
          <p className="text-muted">No outflows in {resolved.label.toLowerCase()}.</p>
          <p className="mt-2 text-sm text-muted">
            Import a bank CSV on the Transactions page to see spending here.
          </p>
          <Link href="/transactions" className={`${buttonClasses("primary")} mt-4 inline-flex`}>
            Go to Transactions
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-6">
            <SpendingTrendSummary
              totalFormatted={summary.totalFormatted}
              deltaFormatted={summary.deltaFormatted}
              trend={summary.trend}
              compareLabel={resolved.compareLabel}
            />
          </div>

          <div className="mt-6">
            <SpendingChart
              data={series}
              buckets={resolved.buckets}
              periodLabel={resolved.label}
              compareLabel={resolved.compareLabel}
            />
            <p className="mt-2 text-xs text-muted">
              Area: {resolved.label}. Dotted line: {resolved.compareLabel}. Values are cumulative.
            </p>
          </div>

          <section className="mt-10">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="font-display text-lg font-semibold">Top 10</h2>
              <BreakdownChips period={period} breakdown={breakdown} />
            </div>
            <div className="mt-4">
              {topRows.length === 0 ? (
                <p className="text-sm text-muted">No categorised outflows in this period.</p>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH className="w-12">#</TH>
                      <TH>{breakdown === "category" ? "Category" : "Merchant"}</TH>
                      <TH className="text-right">Amount</TH>
                      <TH className="text-right">Share</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {topRows.map((row) => (
                      <TR key={row.key}>
                        <TD className="text-muted">{row.rank}</TD>
                        <TD>{row.label}</TD>
                        <TD className="text-right">{row.totalFormatted}</TD>
                        <TD className="text-right text-muted">{row.sharePercent}%</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
