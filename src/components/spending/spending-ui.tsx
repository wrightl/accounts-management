import Link from "next/link";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { CustomPeriodForm } from "@/components/period/custom-period-form";
import { PERIOD_PRESET_OPTIONS, todayIsoDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { SpendingTrend } from "@/lib/spending/queries";

const BREAKDOWN_OPTIONS = [
  { value: "category", label: "Top categories" },
  { value: "merchant", label: "Top merchants" },
] as const;

export function PeriodChips({
  period,
  breakdown,
  customFrom,
  customTo,
}: {
  period: string;
  breakdown: string;
  customFrom: string;
  customTo: string;
}) {
  const today = todayIsoDate();
  const defaultCustomFrom = `${today.slice(0, 8)}01`;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {PERIOD_PRESET_OPTIONS.map((option) => {
          const active = period === option.value;
          const href =
            option.value === "custom"
              ? `/spending?period=custom&from=${customFrom || defaultCustomFrom}&to=${customTo || today}&breakdown=${breakdown}`
              : `/spending?period=${option.value}&breakdown=${breakdown}`;
          return (
            <Link
              key={option.value}
              href={href}
              className={cn(
                "inline-flex items-center rounded-full px-3 py-1.5 text-sm transition-colors",
                active
                  ? "bg-navy text-white"
                  : "border border-border bg-surface text-muted hover:bg-wash hover:text-foreground",
              )}
            >
              {option.label}
            </Link>
          );
        })}
      </div>
      {period === "custom" ? (
        <CustomPeriodForm
          action="/spending"
          from={customFrom}
          to={customTo}
          hiddenFields={{ breakdown }}
        />
      ) : null}
    </div>
  );
}

export function BreakdownChips({
  period,
  breakdown,
}: {
  period: string;
  breakdown: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {BREAKDOWN_OPTIONS.map((option) => {
        const active = breakdown === option.value;
        const href = `/spending?period=${period}&breakdown=${option.value}`;
        return (
          <Link
            key={option.value}
            href={href}
            className={cn(
              "inline-flex items-center rounded-full px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-accent/40 text-navy"
                : "border border-border bg-surface text-muted hover:bg-wash hover:text-foreground",
            )}
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}

export function SpendingTrendSummary({
  totalFormatted,
  deltaFormatted,
  trend,
  compareLabel,
}: {
  totalFormatted: string;
  deltaFormatted: string;
  trend: SpendingTrend;
  compareLabel: string;
}) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor =
    trend === "up" ? "text-destructive" : trend === "down" ? "text-success" : "text-muted";
  const direction =
    trend === "up" ? "more" : trend === "down" ? "less" : "the same as";

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <p className="text-sm text-muted">Spending this period</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <p className="font-display text-3xl font-normal tracking-tight">{totalFormatted}</p>
        <div className={cn("flex items-center gap-1.5 text-sm", trendColor)}>
          <TrendIcon className="h-4 w-4" aria-hidden />
          {trend === "same" ? (
            <span>Same as {compareLabel.toLowerCase()}</span>
          ) : (
            <span>
              {deltaFormatted} {direction} than {compareLabel.toLowerCase()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
