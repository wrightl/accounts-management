"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardTitle, CardValue } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatIsoDateUk } from "@/lib/dates";
import {
  applyWhatIfs,
  buildForecast,
  type ForecastEvent,
  type WhatIf,
} from "@/lib/forecast/engine";
import { formatGBP, poundsToPence } from "@/lib/money";

function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function axisPounds(pence: number): string {
  const pounds = pence / 100;
  return Math.abs(pounds) >= 1000 ? `£${Math.round(pounds / 1000)}k` : `£${Math.round(pounds)}`;
}

function poundsOrNull(raw: string): number | null {
  if (!raw.trim()) return null;
  try {
    const pence = poundsToPence(raw);
    return pence >= 0 ? pence : null;
  } catch {
    return null;
  }
}

export function ForecastView({
  openingCashPence,
  cashKnown,
  firstWeekStart,
  events,
  weeklySpendPence,
  clients,
}: {
  openingCashPence: number;
  cashKnown: boolean;
  firstWeekStart: string;
  events: ForecastEvent[];
  weeklySpendPence: number;
  clients: { id: string; name: string }[];
}) {
  const [excludeOverdue, setExcludeOverdue] = useState(false);
  const [lateClientId, setLateClientId] = useState("");
  const [lateWeeks, setLateWeeks] = useState("4");
  const [hireCost, setHireCost] = useState("");
  const [hireStart, setHireStart] = useState(firstWeekStart);
  const [spendOverride, setSpendOverride] = useState("");
  const [lowCash, setLowCash] = useState(((weeklySpendPence * 4) / 100).toFixed(0));
  const [openWeek, setOpenWeek] = useState<number | null>(null);

  const forecast = useMemo(() => {
    const whatIf: WhatIf = {
      excludeOverdue,
      lateClientId: lateClientId || null,
      lateWeeks: Number(lateWeeks),
      hireMonthlyCostPence: poundsOrNull(hireCost) ?? 0,
      hireStartDate: hireStart || null,
    };
    return buildForecast({
      openingCashPence,
      firstWeekStart,
      events: applyWhatIfs(events, whatIf, firstWeekStart),
      weeklySpendPence: poundsOrNull(spendOverride) ?? weeklySpendPence,
      lowCashPence: poundsOrNull(lowCash) ?? 0,
    });
  }, [
    excludeOverdue,
    lateClientId,
    lateWeeks,
    hireCost,
    hireStart,
    spendOverride,
    lowCash,
    openingCashPence,
    firstWeekStart,
    events,
    weeklySpendPence,
  ]);

  const chartData = forecast.weeks.map((w) => ({
    label: shortDate(w.start),
    closing: w.closingPence,
    below: w.closingPence < forecast.lowCashPence,
  }));
  const last = forecast.weeks[forecast.weeks.length - 1]!;
  const warning = forecast.firstNegative ?? forecast.firstBelowLow;

  return (
    <div className="space-y-8">
      {warning ? (
        <p
          role="status"
          className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm"
        >
          {forecast.firstNegative
            ? `Cash runs out in the week of ${formatIsoDateUk(forecast.firstNegative.start)}, `
            : `Cash drops below ${formatGBP(forecast.lowCashPence)} in the week of ${formatIsoDateUk(warning.start)}, `}
          reaching {formatGBP(forecast.lowest.closingPence)} at its lowest (week of{" "}
          {formatIsoDateUk(forecast.lowest.start)}).
        </p>
      ) : (
        <p role="status" className="rounded-xl bg-wash px-4 py-3 text-sm">
          Cash stays above {formatGBP(forecast.lowCashPence)} for the next 13 weeks.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardTitle>Cash now</CardTitle>
          <CardValue>{cashKnown ? formatGBP(openingCashPence) : "Unknown"}</CardValue>
        </Card>
        <Card>
          <CardTitle>Lowest point</CardTitle>
          <CardValue>{formatGBP(forecast.lowest.closingPence)}</CardValue>
          <p className="mt-1 text-xs text-muted">Week of {formatIsoDateUk(forecast.lowest.start)}</p>
        </Card>
        <Card>
          <CardTitle>In 13 weeks</CardTitle>
          <CardValue>{formatGBP(last.closingPence)}</CardValue>
          <p className="mt-1 text-xs text-muted">Week of {formatIsoDateUk(last.start)}</p>
        </Card>
      </div>

      <section aria-label="Cash at the end of each week">
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tickFormatter={axisPounds} tick={{ fill: "var(--muted)", fontSize: 11 }} width={56} />
              <Tooltip
                formatter={(value) => [formatGBP(Number(value)), "Cash at end of week"]}
                labelFormatter={(label) => `Week of ${label}`}
              />
              <ReferenceLine
                y={forecast.lowCashPence}
                stroke="var(--destructive)"
                strokeDasharray="4 4"
              />
              <Bar dataKey="closing" radius={[4, 4, 0, 0]}>
                {chartData.map((d) => (
                  <Cell
                    key={d.label}
                    fill={d.below ? "var(--destructive)" : "var(--periwinkle)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-xs text-muted">
          Bars show cash at the end of each week. The dashed line is your low-cash level.
        </p>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-display text-lg font-semibold">What if…</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="lateClient">A client pays late</Label>
            <div className="flex gap-2">
              <Select
                id="lateClient"
                value={lateClientId}
                onChange={(e) => setLateClientId(e.target.value)}
              >
                <option value="">Nobody</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="How late"
                value={lateWeeks}
                onChange={(e) => setLateWeeks(e.target.value)}
              >
                <option value="2">2 weeks late</option>
                <option value="4">4 weeks late</option>
                <option value="8">8 weeks late</option>
                <option value="13">Not at all</option>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="hireCost">New hire, cost a month (£)</Label>
              <Input
                id="hireCost"
                inputMode="decimal"
                placeholder="e.g. 4500"
                value={hireCost}
                onChange={(e) => setHireCost(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="hireStart">Starting</Label>
              <Input
                id="hireStart"
                type="date"
                value={hireStart}
                onChange={(e) => setHireStart(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="spend">Regular spending a week (£)</Label>
            <Input
              id="spend"
              inputMode="decimal"
              placeholder={(weeklySpendPence / 100).toFixed(0)}
              value={spendOverride}
              onChange={(e) => setSpendOverride(e.target.value)}
              aria-describedby="spend-hint"
            />
            <p id="spend-hint" className="mt-1 text-xs text-muted">
              Leave blank to use the last 12 weeks&apos; average.
            </p>
          </div>
          <div>
            <Label htmlFor="lowCash">Warn me below (£)</Label>
            <Input
              id="lowCash"
              inputMode="decimal"
              value={lowCash}
              onChange={(e) => setLowCash(e.target.value)}
            />
          </div>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={excludeOverdue}
            onChange={(e) => setExcludeOverdue(e.target.checked)}
          />
          Leave out invoices that are already overdue
        </label>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold">Week by week</h2>
        <div className="mt-3">
          <Table>
            <THead>
              <TR>
                <TH>Week of</TH>
                <TH className="text-right">In</TH>
                <TH className="text-right">Out</TH>
                <TH className="text-right">Cash at end</TH>
              </TR>
            </THead>
            <TBody>
              {forecast.weeks.map((w) => (
                <TR key={w.start}>
                  <TD>
                    <button
                      type="button"
                      className="text-left underline decoration-border underline-offset-2"
                      aria-expanded={openWeek === w.index}
                      onClick={() => setOpenWeek(openWeek === w.index ? null : w.index)}
                    >
                      {formatIsoDateUk(w.start)}
                    </button>
                    {openWeek === w.index ? (
                      <ul className="mt-2 space-y-1 text-xs text-muted">
                        {w.events.map((e, i) => (
                          <li key={`${e.label}-${i}`}>
                            {e.amountPence > 0 ? "+" : "−"}
                            {formatGBP(Math.abs(e.amountPence))} {e.label}
                            {e.overdue ? " (overdue)" : ""}
                          </li>
                        ))}
                        <li>
                          −{formatGBP(w.spendPence)} regular spending
                        </li>
                      </ul>
                    ) : null}
                  </TD>
                  <TD className="text-right tabular-nums">{formatGBP(w.inPence)}</TD>
                  <TD className="text-right tabular-nums">{formatGBP(w.outPence)}</TD>
                  <TD
                    className={`text-right font-medium tabular-nums ${
                      w.closingPence < forecast.lowCashPence ? "text-destructive" : ""
                    }`}
                  >
                    {formatGBP(w.closingPence)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
