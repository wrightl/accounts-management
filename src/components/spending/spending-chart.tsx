"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatChartTooltipDate } from "@/lib/dates";
import { penceToPounds } from "@/lib/money";
import type { SpendingSeriesPoint } from "@/lib/spending/series";

function formatAxis(value: number): string {
  if (value >= 1000) return `£${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`;
  return `£${value.toFixed(0)}`;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(value);
}

type ChartPoint = SpendingSeriesPoint & {
  current: number;
  previous: number;
};

function SpendingTooltip({
  active,
  payload,
  buckets,
  periodLabel,
  compareLabel,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: ChartPoint }>;
  buckets: "day" | "month";
  periodLabel: string;
  compareLabel: string;
}) {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload as ChartPoint | undefined;
  if (!point) return null;

  const rows = [
    point.currentDate
      ? {
          date: formatChartTooltipDate(point.currentDate, buckets),
          label: periodLabel,
          value: point.current,
        }
      : null,
    point.compareDate
      ? {
          date: formatChartTooltipDate(point.compareDate, buckets),
          label: compareLabel,
          value: point.previous,
        }
      : null,
  ].filter((row): row is NonNullable<typeof row> => row !== null);

  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-sm shadow-sm">
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between gap-4 py-0.5">
          <div>
            <p className="font-medium text-foreground">{row.date}</p>
            <p className="text-xs text-muted">{row.label}</p>
          </div>
          <p className="font-medium tabular-nums">{formatMoney(row.value)}</p>
        </div>
      ))}
    </div>
  );
}

export function SpendingChart({
  data,
  buckets,
  periodLabel,
  compareLabel,
}: {
  data: SpendingSeriesPoint[];
  buckets: "day" | "month";
  periodLabel: string;
  compareLabel: string;
}) {
  const chartData: ChartPoint[] = data.map((point) => ({
    ...point,
    current: penceToPounds(point.currentPence),
    previous: penceToPounds(point.previousPence),
  }));

  if (chartData.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-border bg-surface text-sm text-muted">
        No spending data for this period.
      </div>
    );
  }

  return (
    <div className="h-72 w-full rounded-2xl border border-border bg-surface p-4">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            minTickGap={16}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={formatAxis}
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip
            content={(props) => (
              <SpendingTooltip
                {...props}
                buckets={buckets}
                periodLabel={periodLabel}
                compareLabel={compareLabel}
              />
            )}
          />
          <Area
            type="linear"
            dataKey="current"
            name="current"
            stroke="var(--periwinkle)"
            fill="var(--periwinkle)"
            fillOpacity={0.35}
            strokeWidth={2}
          />
          <Line
            type="linear"
            dataKey="previous"
            name="previous"
            stroke="var(--pink)"
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
