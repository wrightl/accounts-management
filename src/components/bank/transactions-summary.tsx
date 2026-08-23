"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardTitle, CardValue } from "@/components/ui/card";
import type { BankTransactionSummaryData } from "@/lib/bank/summary-types";
import { cn } from "@/lib/utils";

const SLICE_COLORS: Record<string, string> = {
  Incoming: "var(--periwinkle)",
  Outgoing: "var(--destructive)",
};

function formatSignedNet(pence: number, formatted: string): string {
  if (pence > 0) return `+${formatted}`;
  if (pence < 0) return `−${formatted}`;
  return formatted;
}

export function TransactionsSummaryPanel({
  summary,
}: {
  summary: BankTransactionSummaryData;
}) {
  if (summary.totalCount === 0) {
    return (
      <Card>
        <CardTitle>Summary</CardTitle>
        <p className="mt-3 text-sm text-muted">No transactions in this period.</p>
      </Card>
    );
  }

  const chartData = summary.pieSlices.map((slice) => ({
    name: slice.name,
    value: slice.pence / 100,
    percent: slice.percent,
    formatted: slice.formatted,
  }));

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>Summary</CardTitle>
        <p className="mt-1 text-xs text-muted">{summary.periodLabel}</p>

        {chartData.length > 0 ? (
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
                    <Cell key={entry.name} fill={SLICE_COLORS[entry.name] ?? "var(--muted)"} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, _name, item) => {
                    const payload = item?.payload as (typeof chartData)[number] | undefined;
                    const pounds = typeof value === "number" ? value : Number(value ?? 0);
                    return [
                      payload?.formatted ?? `£${pounds.toFixed(2)}`,
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
        ) : null}

        <ul className="mt-3 space-y-1.5 text-sm">
          {summary.pieSlices.map((slice) => (
            <li key={slice.name} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-muted">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: SLICE_COLORS[slice.name] }}
                />
                {slice.name}
              </span>
              <span className="tabular-nums">
                {slice.formatted}{" "}
                <span className="text-muted">({slice.percent}%)</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardTitle>Totals</CardTitle>
        <dl className="mt-3 space-y-3">
          <div>
            <dt className="text-xs text-muted">Incoming</dt>
            <dd className={cn("font-display text-xl tabular-nums", "text-success")}>
              {summary.incomingFormatted}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Outgoing</dt>
            <dd className={cn("font-display text-xl tabular-nums", "text-destructive")}>
              {summary.outgoingFormatted}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Net (cumulative)</dt>
            <dd
              className={cn(
                "font-display text-xl tabular-nums",
                summary.netPence >= 0 ? "text-success" : "text-destructive",
              )}
            >
              {formatSignedNet(summary.netPence, summary.netFormatted)}
            </dd>
          </div>
        </dl>
      </Card>

      <Card>
        <CardTitle>Details</CardTitle>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Transactions</dt>
            <dd className="text-right tabular-nums">
              {summary.totalCount} ({summary.incomingCount} in · {summary.outgoingCount} out)
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Reconciled</dt>
            <dd className="text-right tabular-nums">{summary.reconciledPercent}%</dd>
          </div>
          {summary.unreconciledCount > 0 && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted">Unreconciled</dt>
              <dd className="text-right tabular-nums text-destructive">
                {summary.unreconciledCount}
              </dd>
            </div>
          )}
          {summary.largestIncomingFormatted && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted">Largest incoming</dt>
              <dd className="text-right tabular-nums text-success">
                {summary.largestIncomingFormatted}
              </dd>
            </div>
          )}
          {summary.largestOutgoingFormatted && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted">Largest outgoing</dt>
              <dd className="text-right tabular-nums text-destructive">
                {summary.largestOutgoingFormatted}
              </dd>
            </div>
          )}
          {summary.statementBalanceFormatted && (
            <div className="flex justify-between gap-2 border-t border-border pt-2">
              <dt className="text-muted">Balance (last import)</dt>
              <dd className="text-right">
                <CardValue className="mt-0 text-lg">{summary.statementBalanceFormatted}</CardValue>
                {summary.statementBalanceDate && (
                  <p className="text-xs text-muted">as at {summary.statementBalanceDate}</p>
                )}
              </dd>
            </div>
          )}
        </dl>
      </Card>
    </div>
  );
}
