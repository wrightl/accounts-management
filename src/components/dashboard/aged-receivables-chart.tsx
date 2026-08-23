"use client";

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

type BucketKey = (typeof BUCKET_LABELS)[number]["key"];

export function AgedReceivablesChart({
  raw,
  formatted,
}: {
  raw: { current: number; d30: number; d60: number; d90: number };
  formatted: { current: string; d30: string; d60: string; d90: string };
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
    <Card>
      <CardTitle>Aged receivables</CardTitle>
      <p className="mt-1 text-xs text-muted">Outstanding invoice balances by days past due</p>
      {totalPence === 0 ? (
        <p className="mt-6 text-sm text-muted">No outstanding receivables.</p>
      ) : (
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
            >
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={(value) =>
                  value >= 1000 ? `£${(value / 1000).toFixed(0)}k` : `£${value}`
                }
                tick={{ fill: "var(--muted)", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="label"
                width={72}
                tick={{ fill: "var(--muted)", fontSize: 12 }}
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
              <Bar dataKey="pounds" radius={[0, 4, 4, 0]}>
                {chartData.map((entry) => (
                  <Cell key={entry.key} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {totalPence > 0 ? (
        <p className="mt-3 text-sm text-muted">Total outstanding: {formatGBP(totalPence)}</p>
      ) : null}
    </Card>
  );
}
