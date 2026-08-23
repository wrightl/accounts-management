"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardTitle } from "@/components/ui/card";

export type StatusDonutSlice = {
  key: string;
  label: string;
  count: number;
  grossFormatted: string;
  percent: number;
  color: string;
};

export function StatusDonutChart({
  title,
  subtitle,
  slices,
}: {
  title: string;
  subtitle?: string;
  slices: StatusDonutSlice[];
}) {
  if (slices.length === 0) {
    return (
      <Card>
        <CardTitle>{title}</CardTitle>
        {subtitle ? <p className="mt-1 text-xs text-muted">{subtitle}</p> : null}
        <p className="mt-6 text-sm text-muted">No data yet.</p>
      </Card>
    );
  }

  const chartData = slices.map((slice) => ({
    name: slice.label,
    value: slice.count,
    percent: slice.percent,
    grossFormatted: slice.grossFormatted,
    color: slice.color,
    key: slice.key,
  }));

  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      {subtitle ? <p className="mt-1 text-xs text-muted">{subtitle}</p> : null}
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
                <Cell key={entry.key} fill={entry.color} />
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
        {slices.map((row) => (
          <li key={row.key} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-muted">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: row.color }}
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
