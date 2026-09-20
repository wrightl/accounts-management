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
import type { ClientRevenueSlice } from "@/lib/dashboard/queries";
import { penceToPounds } from "@/lib/money";

const COLORS = [
  "var(--navy)",
  "var(--periwinkle)",
  "var(--accent)",
  "var(--pink)",
  "var(--muted)",
  "var(--border)",
];

export function TopClientsChart({
  clients,
  periodLabel,
}: {
  clients: ClientRevenueSlice[];
  periodLabel: string;
}) {
  const chartData = clients.map((c, i) => ({
    ...c,
    pounds: penceToPounds(c.grossPence),
    color: COLORS[i % COLORS.length]!,
  }));

  return (
    <Card className="h-full">
      <CardTitle>Revenue by client</CardTitle>
      <p className="mt-1 text-xs text-muted">
        Invoiced gross · {periodLabel}
      </p>
      {chartData.length === 0 ? (
        <div className="mt-6 space-y-2">
          <p className="text-sm text-muted">No invoices in this period.</p>
          <Link href="/invoices" className="text-sm text-brand hover:underline">
            View invoices →
          </Link>
        </div>
      ) : (
        <div className="mt-4 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 4, right: 12, left: 4, bottom: 0 }}
            >
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={(v) =>
                  v >= 1000 ? `£${(v / 1000).toFixed(0)}k` : `£${v}`
                }
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={88}
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(_v, _n, item) => {
                  const p = item.payload as (typeof chartData)[number];
                  return [`${p.grossFormatted} (${p.percent}%)`, p.name];
                }}
                contentStyle={{
                  borderRadius: "12px",
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                }}
              />
              <Bar dataKey="pounds" radius={[0, 4, 4, 0]} maxBarSize={18}>
                {chartData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
