"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardTitle } from "@/components/ui/card";
import type { ClientOverviewData } from "@/lib/clients/overview";
import type { QuoteStatus } from "@/lib/quotes/status";

const STATUS_COLORS: Record<QuoteStatus, string> = {
  draft: "var(--muted)",
  sent: "var(--periwinkle)",
  accepted: "var(--navy)",
  declined: "var(--destructive)",
};

export function ClientQuoteStatusChart({
  breakdown,
}: {
  breakdown: ClientOverviewData["quoteStatusBreakdown"];
}) {
  if (breakdown.length === 0) return null;

  const chartData = breakdown.map((slice) => ({
    name: slice.label,
    status: slice.status,
    value: slice.count,
    percent: slice.percent,
    grossFormatted: slice.grossFormatted,
  }));

  return (
    <Card>
      <CardTitle>Quote statuses</CardTitle>
      <div className="mt-4 h-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={48}
              outerRadius={72}
              paddingAngle={2}
            >
              {chartData.map((entry) => (
                <Cell key={entry.status} fill={STATUS_COLORS[entry.status]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(_value, _name, item) => {
                const payload = item?.payload as (typeof chartData)[number] | undefined;
                return [
                  `${payload?.value ?? 0} (${payload?.percent ?? 0}%) · ${payload?.grossFormatted ?? ""}`,
                  payload?.name ?? "",
                ];
              }}
              contentStyle={{
                borderRadius: "12px",
                border: "1px solid var(--border)",
                background: "var(--surface)",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-3 space-y-1.5 text-sm">
        {breakdown.map((row) => (
          <li key={row.status} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-muted">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: STATUS_COLORS[row.status] }}
              />
              {row.label}
            </span>
            <span className="tabular-nums">
              {row.count}
              <span className="ml-2 text-muted">{row.grossFormatted}</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
