"use client";

import Link from "next/link";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardTitle } from "@/components/ui/card";
import type { ExpenseCategorySlice } from "@/lib/dashboard/queries";

const COLORS = [
  "var(--periwinkle)",
  "var(--navy)",
  "var(--pink)",
  "var(--accent)",
  "var(--muted)",
  "var(--destructive)",
];

export function ExpenseMixChart({
  slices,
  periodLabel,
}: {
  slices: ExpenseCategorySlice[];
  periodLabel: string;
}) {
  const chartData = slices.map((s, i) => ({
    ...s,
    name: s.category,
    value: s.totalPence,
    color: COLORS[i % COLORS.length]!,
  }));

  return (
    <Card className="h-full">
      <CardTitle>Expense mix</CardTitle>
      <p className="mt-1 text-xs text-muted">
        By category · {periodLabel} · ex VAT
      </p>
      {chartData.length === 0 ? (
        <div className="mt-6 space-y-2">
          <p className="text-sm text-muted">No expenses in this period.</p>
          <Link href="/expenses" className="text-sm text-brand hover:underline">
            Add an expense →
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-4 h-40">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={64}
                  paddingAngle={2}
                >
                  {chartData.map((entry) => (
                    <Cell key={entry.category} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(_v, _n, item) => {
                    const p = item?.payload as (typeof chartData)[number] | undefined;
                    return [
                      `${p?.totalFormatted ?? ""} (${p?.percent ?? 0}%)`,
                      p?.name ?? "",
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
          <ul className="mt-2 space-y-1 text-sm">
            {slices.slice(0, 4).map((row, i) => (
              <li key={row.category} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-muted">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: COLORS[i % COLORS.length] }}
                  />
                  {row.category}
                </span>
                <span className="tabular-nums">{row.totalFormatted}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
