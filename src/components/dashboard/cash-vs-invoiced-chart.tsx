"use client";

import Link from "next/link";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardTitle } from "@/components/ui/card";
import type { MonthlyCashPoint } from "@/lib/dashboard/queries";
import { penceToPounds } from "@/lib/money";

function formatAxis(value: number): string {
  if (Math.abs(value) >= 1000) {
    return `£${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`;
  }
  return `£${value.toFixed(0)}`;
}

type ChartRow = MonthlyCashPoint & {
  invoiced: number;
  collected: number;
  profit: number;
};

export function CashVsInvoicedChart({ data }: { data: MonthlyCashPoint[] }) {
  const chartData: ChartRow[] = data.map((point) => ({
    ...point,
    invoiced: penceToPounds(point.invoicedPence),
    collected: penceToPounds(point.collectedPence),
    profit: penceToPounds(point.profitPence),
  }));

  const hasData = chartData.some(
    (row) =>
      row.invoicedPence > 0 || row.collectedPence > 0 || row.profitPence !== 0,
  );

  return (
    <Card className="h-full">
      <CardTitle>Cash vs invoiced</CardTitle>
      <p className="mt-1 text-xs text-muted">
        Last 12 months · bars are invoices raised; line is cash collected
      </p>
      {!hasData ? (
        <div className="mt-6 space-y-2">
          <p className="text-sm text-muted">
            No invoicing or payments in the last year yet.
          </p>
          <Link href="/quotes/new" className="text-sm text-brand hover:underline">
            Send a quote →
          </Link>
        </div>
      ) : (
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
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
                formatter={(_value, name, item) => {
                  const payload = item.payload as ChartRow;
                  if (name === "Invoiced") return [payload.invoicedFormatted, "Invoiced"];
                  if (name === "Collected") return [payload.collectedFormatted, "Collected"];
                  if (name === "Profit") return [payload.profitFormatted, "Profit"];
                  return [String(_value), String(name)];
                }}
                contentStyle={{
                  borderRadius: "12px",
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                }}
              />
              <Legend wrapperStyle={{ fontSize: "12px", color: "var(--muted)" }} />
              <Bar
                dataKey="invoiced"
                name="Invoiced"
                fill="var(--periwinkle)"
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
              />
              <Area
                type="monotone"
                dataKey="collected"
                name="Collected"
                stroke="var(--navy)"
                fill="var(--navy)"
                fillOpacity={0.08}
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="profit"
                name="Profit"
                stroke="var(--pink)"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
