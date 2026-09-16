"use client";

import Link from "next/link";
import { SpendingChart } from "@/components/spending/spending-chart";
import type { SpendingSummary } from "@/lib/spending/queries";
import type { SpendingSeriesPoint } from "@/lib/spending/series";

export function SpendingSnapshot({
  summary,
  series,
  periodLabel,
  compareLabel,
  buckets,
}: {
  summary: SpendingSummary;
  series: SpendingSeriesPoint[];
  periodLabel: string;
  compareLabel: string;
  buckets: "day" | "month";
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-normal text-muted">Cash spending</h3>
          <p className="mt-1 text-xs text-muted">{periodLabel}</p>
        </div>
        <Link
          href="/spending"
          className="text-sm text-brand hover:underline"
        >
          View spending
        </Link>
      </div>
      <p className="mt-3 font-display text-2xl tabular-nums">{summary.totalFormatted}</p>
      <p className="mt-1 text-sm text-muted">
        vs {summary.compareTotalFormatted} {compareLabel.toLowerCase()}
      </p>
      <div className="mt-4 [&>div]:h-56 [&>div]:rounded-xl">
        <SpendingChart
          data={series}
          buckets={buckets}
          periodLabel={periodLabel}
          compareLabel={compareLabel}
        />
      </div>
    </div>
  );
}
