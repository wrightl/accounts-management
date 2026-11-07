import Link from "next/link";
import { PastYearSelect } from "@/components/dashboard/past-year-select";
import {
  DASHBOARD_PERIOD_OPTIONS,
  pastFinancialYearStart,
  type DashboardPeriodKey,
} from "@/lib/dashboard/period";
import { cn } from "@/lib/utils";

export function PeriodChips({
  current,
  pastYears = [],
}: {
  current: DashboardPeriodKey;
  pastYears?: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Period">
        {DASHBOARD_PERIOD_OPTIONS.map((opt) => {
          const active = opt.value === current;
          return (
            <Link
              key={opt.value}
              href={opt.value === "this-month" ? "/dashboard" : `/dashboard?period=${opt.value}`}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                active
                  ? "border-navy bg-navy text-white"
                  : "border-border bg-surface text-muted hover:bg-wash/50 hover:text-foreground",
              )}
              aria-current={active ? "page" : undefined}
            >
              {opt.label}
            </Link>
          );
        })}
        {pastYears.length > 0 ? <PastYearSelect current={current} years={pastYears} /> : null}
      </div>
      {pastFinancialYearStart(current) !== null ? (
        <p className="text-xs text-muted">
          Outstanding, pipeline and the attention list show today&apos;s position.
        </p>
      ) : null}
    </div>
  );
}
