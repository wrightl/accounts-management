"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardTitle, CardValue } from "@/components/ui/card";
import type { QuotesSummaryData } from "@/lib/quotes/summary";

const SLICE_COLORS = [
  "var(--periwinkle)",
  "var(--destructive)",
  "var(--accent)",
  "var(--navy)",
  "var(--muted)",
  "#94a3b8",
  "#64748b",
];

export function QuotesSummaryPanel({ summary }: { summary: QuotesSummaryData }) {
  if (summary.totalCount === 0) {
    return (
      <Card>
        <CardTitle>Summary</CardTitle>
        <p className="mt-3 text-sm text-muted">
          {summary.filtersActive
            ? "No quotes match these filters."
            : "No quotes yet."}
        </p>
      </Card>
    );
  }

  const chartData = summary.declineReasons.map((slice) => ({
    name: slice.category,
    value: slice.count,
    percent: slice.percent,
    grossFormatted: slice.grossFormatted,
  }));

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>Summary</CardTitle>
        <p className="mt-1 text-xs text-muted">
          {summary.filtersActive ? "Filtered quotes" : "All quotes"}
        </p>
        <CardValue className="text-xl">{summary.totalGrossFormatted}</CardValue>
        <p className="mt-1 text-sm text-muted">
          {summary.totalCount} quote{summary.totalCount === 1 ? "" : "s"}
        </p>
      </Card>

      <Card>
        <CardTitle>Pipeline</CardTitle>
        <dl className="mt-3 space-y-3 text-sm">
          <div>
            <dt className="text-xs text-muted">Open (draft, sent, accepted)</dt>
            <dd className="font-display text-xl tabular-nums">
              {summary.pipelineGrossFormatted}
            </dd>
            <dd className="text-muted">{summary.pipelineCount} quotes</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Declined</dt>
            <dd className="font-display text-xl tabular-nums">
              {summary.declinedGrossFormatted}
            </dd>
            <dd className="text-muted">{summary.declinedCount} quotes</dd>
          </div>
        </dl>
      </Card>

      {chartData.length > 0 ? (
        <Card>
          <CardTitle>Decline reasons</CardTitle>
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
                  {chartData.map((entry, index) => (
                    <Cell
                      key={entry.name}
                      fill={SLICE_COLORS[index % SLICE_COLORS.length]}
                    />
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
            {summary.declineReasons.map((row, index) => (
              <li key={row.category} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-muted">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: SLICE_COLORS[index % SLICE_COLORS.length] }}
                  />
                  {row.category}
                </span>
                <span className="tabular-nums">
                  {row.count}
                  <span className="ml-2 text-muted">{row.grossFormatted}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardTitle>By status</CardTitle>
        <ul className="mt-3 space-y-2 text-sm">
          {summary.byStatus.map((row) => (
            <li key={row.status} className="flex items-center justify-between gap-2">
              <span className="text-muted">{row.label}</span>
              <span className="text-right tabular-nums">
                {row.count}
                <span className="ml-2 text-muted">{row.grossFormatted}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardTitle>Details</CardTitle>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Sent</dt>
            <dd className="tabular-nums">{summary.sentCount}</dd>
          </div>
          {summary.expiringSoonCount > 0 ? (
            <div className="flex justify-between gap-2">
              <dt className="text-muted">Expiring within 30 days</dt>
              <dd className="tabular-nums text-brand">{summary.expiringSoonCount}</dd>
            </div>
          ) : null}
          {summary.largestQuote ? (
            <div className="flex justify-between gap-2 border-t border-border pt-2">
              <dt className="text-muted">Largest quote</dt>
              <dd className="text-right">
                <span className="block font-medium">{summary.largestQuote.number}</span>
                <span className="tabular-nums text-muted">
                  {summary.largestQuote.grossFormatted}
                </span>
              </dd>
            </div>
          ) : null}
        </dl>
      </Card>
    </div>
  );
}
