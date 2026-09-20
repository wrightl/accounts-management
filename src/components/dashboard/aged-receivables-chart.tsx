"use client";

import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardTitle } from "@/components/ui/card";
import { formatGBP, penceToPounds } from "@/lib/money";

const BUCKET_COLORS = [
  "var(--periwinkle)",
  "var(--accent)",
  "var(--navy)",
  "var(--destructive)",
];

const BUCKET_LABELS = [
  { key: "current", label: "Current" },
  { key: "d30", label: "1–30 days" },
  { key: "d60", label: "31–60 days" },
  { key: "d90", label: "90+ days" },
] as const;

export function AgedReceivablesChart({
  raw,
  formatted,
  overduePercent,
}: {
  raw: { current: number; d30: number; d60: number; d90: number };
  formatted: { current: string; d30: string; d60: string; d90: string };
  overduePercent?: number | null;
}) {
  const chartData = BUCKET_LABELS.map((bucket, index) => ({
    key: bucket.key,
    label: bucket.label,
    pence: raw[bucket.key],
    pounds: penceToPounds(raw[bucket.key]),
    formatted: formatted[bucket.key],
    color: BUCKET_COLORS[index]!,
  }));

  const totalPence = chartData.reduce((acc, row) => acc + row.pence, 0);

  return (
    <Card className="h-full">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle>Aged receivables</CardTitle>
          <p className="mt-1 text-xs text-muted">
            Outstanding balances by days past due
            {overduePercent != null
              ? ` · ${overduePercent}% past due`
              : ""}
          </p>
        </div>
        {raw.d90 > 0 ? (
          <Link
            href="/invoices"
            className="text-xs text-destructive hover:underline"
          >
            Review 90+ →
          </Link>
        ) : null}
      </div>
      {totalPence === 0 ? (
        <p className="mt-6 text-sm text-muted">No outstanding receivables.</p>
      ) : (
        <>
          <div className="mt-4 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 4, right: 12, left: 4, bottom: 0 }}
              >
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(value) =>
                    value >= 1000 ? `£${(value / 1000).toFixed(0)}k` : `£${value}`
                  }
                  tick={{ fill: "var(--muted)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={72}
                  tick={{ fill: "var(--muted)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(_value, _name, item) => {
                    const payload = item.payload as (typeof chartData)[number];
                    return [payload.formatted, payload.label];
                  }}
                  contentStyle={{
                    borderRadius: "12px",
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                  }}
                />
                <Bar dataKey="pounds" radius={[0, 4, 4, 0]} maxBarSize={16}>
                  {chartData.map((entry) => (
                    <Cell key={entry.key} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {/* Stacked proportion bar */}
          <div className="mt-3 flex h-2 overflow-hidden rounded-full">
            {chartData
              .filter((b) => b.pence > 0)
              .map((bucket) => (
                <div
                  key={bucket.key}
                  className="h-full"
                  style={{
                    width: `${(bucket.pence / totalPence) * 100}%`,
                    background: bucket.color,
                  }}
                  title={`${bucket.label}: ${bucket.formatted}`}
                />
              ))}
          </div>
          <p className="mt-3 text-sm text-muted">
            Total outstanding: {formatGBP(totalPence)}
          </p>
        </>
      )}
    </Card>
  );
}
