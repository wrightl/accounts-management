"use client";

import Link from "next/link";
import {
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
  income: number;
  expenses: number;
  profit: number;
};

export function IncomeExpenseChart({
  data,
}: {
  data: MonthlyCashPoint[];
}) {
  const rows: ChartRow[] = data.map((point) => ({
    ...point,
    income: penceToPounds(point.incomePence),
    expenses: penceToPounds(point.expensePence),
    profit: penceToPounds(point.profitPence),
  }));

  const hasData = rows.some(
    (row) => row.incomePence > 0 || row.expensePence > 0,
  );

  return (
    <Card className="h-full">
      <CardTitle>Income vs expenses</CardTitle>
      <p className="mt-1 text-xs text-muted">
        Last 12 months · accrual income (ex VAT) with profit overlay
      </p>
      {!hasData ? (
        <div className="mt-6 space-y-2">
          <p className="text-sm text-muted">
            No invoiced income or expenses in this period.
          </p>
          <Link href="/reports" className="text-sm text-brand hover:underline">
            Open reports →
          </Link>
        </div>
      ) : (
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
                  if (name === "Income") return [payload.incomeFormatted, "Income"];
                  if (name === "Expenses") return [payload.expenseFormatted, "Expenses"];
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
                dataKey="income"
                name="Income"
                fill="var(--periwinkle)"
                radius={[4, 4, 0, 0]}
                maxBarSize={22}
              />
              <Bar
                dataKey="expenses"
                name="Expenses"
                fill="var(--pink)"
                radius={[4, 4, 0, 0]}
                maxBarSize={22}
              />
              <Line
                type="monotone"
                dataKey="profit"
                name="Profit"
                stroke="var(--navy)"
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
