import Link from "next/link";
import { DASHBOARD_PERIOD_OPTIONS, type DashboardPeriodKey } from "@/lib/dashboard/period";
import { cn } from "@/lib/utils";

export function PeriodChips({
  current,
}: {
  current: DashboardPeriodKey;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Period">
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
    </div>
  );
}
