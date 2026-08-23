"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardTitle } from "@/components/ui/card";
import type { MonthlyIncomeExpensePoint } from "@/lib/dashboard/queries";
import { penceToPounds } from "@/lib/money";

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

type ChartRow = MonthlyIncomeExpensePoint & {
  income: number;
  expenses: number;
  profit: number;
};

export function IncomeExpenseChart({
  data,
}: {
  data: MonthlyIncomeExpensePoint[];
}) {
  const chartData: ChartRow[] = data.map((point) => ({
    ...point,
    income: penceToPounds(point.incomePence),
    expenses: penceToPounds(point.expensePence),
    profit: penceToPounds(point.profitPence),
  }));

  const hasData = chartData.some(
    (row) => row.incomePence > 0 || row.expensePence > 0,
  );

  return (
    <Card>
      <CardTitle>Income vs expenses</CardTitle>
      <p className="mt-1 text-xs text-muted">Last 6 months · accrual basis</p>
      {!hasData ? (
        <p className="mt-6 text-sm text-muted">No invoiced income or expenses in this period.</p>
      ) : (
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "var(--muted)", fontSize: 12 }}
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
                formatter={(value, name, item) => {
                  const payload = item.payload as ChartRow;
                  if (name === "Income") return [payload.incomeFormatted, "Income"];
                  if (name === "Expenses") return [payload.expenseFormatted, "Expenses"];
                  return [formatMoney(Number(value)), String(name)];
                }}
                contentStyle={{
                  borderRadius: "12px",
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: "12px", color: "var(--muted)" }}
              />
              <Bar dataKey="income" name="Income" fill="var(--periwinkle)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expenses" name="Expenses" fill="var(--pink)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
