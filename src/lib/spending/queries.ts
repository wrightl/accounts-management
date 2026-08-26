import "server-only";
import { and, desc, eq, gte, lte, lt, sql, sum } from "drizzle-orm";
import { getDb } from "@/db";
import { bankAccounts, bankTransactions } from "@/db/schema";
import { formatBankCategory } from "@/lib/bank/categories";
import { eachDay, eachMonth, ordinalDayFromIso } from "@/lib/dates";
import { formatGBP } from "@/lib/money";
import { toCumulativeSeries, type SpendingSeriesPoint } from "@/lib/spending/series";

export type { SpendingSeriesPoint } from "@/lib/spending/series";

export type SpendingTrend = "up" | "down" | "same";

export interface SpendingSummary {
  totalPence: number;
  compareTotalPence: number;
  deltaPence: number;
  totalFormatted: string;
  compareTotalFormatted: string;
  deltaFormatted: string;
  trend: SpendingTrend;
}

export interface TopSpendingRow {
  rank: number;
  key: string;
  label: string;
  totalPence: number;
  totalFormatted: string;
  sharePercent: number;
}

async function sumOutflows(
  companyId: string,
  from: string,
  to: string,
): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({
      total: sum(sql<number>`abs(${bankTransactions.amountPence})`).mapWith(Number),
    })
    .from(bankTransactions)
    .innerJoin(bankAccounts, eq(bankTransactions.bankAccountId, bankAccounts.id))
    .where(
      and(
        eq(bankAccounts.companyId, companyId),
        lt(bankTransactions.amountPence, 0),
        gte(bankTransactions.bookedAt, from),
        lte(bankTransactions.bookedAt, to),
      ),
    );
  return row?.total ?? 0;
}

function computeTrend(current: number, previous: number): SpendingTrend {
  if (current > previous) return "up";
  if (current < previous) return "down";
  return "same";
}

export async function getSpendingSummary(
  companyId: string,
  input: {
    from: string;
    to: string;
    compareFrom: string;
    compareTo: string;
  },
): Promise<SpendingSummary> {
  const [totalPence, compareTotalPence] = await Promise.all([
    sumOutflows(companyId, input.from, input.to),
    sumOutflows(companyId, input.compareFrom, input.compareTo),
  ]);
  const deltaPence = totalPence - compareTotalPence;
  return {
    totalPence,
    compareTotalPence,
    deltaPence,
    totalFormatted: formatGBP(totalPence),
    compareTotalFormatted: formatGBP(compareTotalPence),
    deltaFormatted: formatGBP(Math.abs(deltaPence)),
    trend: computeTrend(totalPence, compareTotalPence),
  };
}

async function outflowsByDay(
  companyId: string,
  from: string,
  to: string,
): Promise<Map<string, number>> {
  const db = getDb();
  const rows = await db
    .select({
      day: bankTransactions.bookedAt,
      total: sum(sql<number>`abs(${bankTransactions.amountPence})`).mapWith(Number),
    })
    .from(bankTransactions)
    .innerJoin(bankAccounts, eq(bankTransactions.bankAccountId, bankAccounts.id))
    .where(
      and(
        eq(bankAccounts.companyId, companyId),
        lt(bankTransactions.amountPence, 0),
        gte(bankTransactions.bookedAt, from),
        lte(bankTransactions.bookedAt, to),
      ),
    )
    .groupBy(bankTransactions.bookedAt);

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.day, row.total ?? 0);
  }
  return map;
}

async function outflowsByMonth(
  companyId: string,
  from: string,
  to: string,
): Promise<Map<string, number>> {
  const db = getDb();
  const rows = await db
    .select({
      month: sql<string>`to_char(${bankTransactions.bookedAt}, 'YYYY-MM')`,
      total: sum(sql<number>`abs(${bankTransactions.amountPence})`).mapWith(Number),
    })
    .from(bankTransactions)
    .innerJoin(bankAccounts, eq(bankTransactions.bankAccountId, bankAccounts.id))
    .where(
      and(
        eq(bankAccounts.companyId, companyId),
        lt(bankTransactions.amountPence, 0),
        gte(bankTransactions.bookedAt, from),
        lte(bankTransactions.bookedAt, to),
      ),
    )
    .groupBy(sql`to_char(${bankTransactions.bookedAt}, 'YYYY-MM')`);

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.month, row.total ?? 0);
  }
  return map;
}

function dayAxisLabel(iso: string): string {
  return ordinalDayFromIso(iso);
}

function monthAxisLabel(key: string): string {
  const [year, month] = key.split("-");
  const d = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  return d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
}

export async function getSpendingSeries(
  companyId: string,
  input: {
    from: string;
    to: string;
    compareFrom: string;
    compareTo: string;
    buckets: "day" | "month";
  },
): Promise<SpendingSeriesPoint[]> {
  if (input.buckets === "day") {
    const currentDays = eachDay(input.from, input.to);
    const compareDays = eachDay(input.compareFrom, input.compareTo);
    const [currentMap, compareMap] = await Promise.all([
      outflowsByDay(companyId, input.from, input.to),
      outflowsByDay(companyId, input.compareFrom, input.compareTo),
    ]);

    const len = Math.max(currentDays.length, compareDays.length);
    const points: SpendingSeriesPoint[] = [];
    for (let i = 0; i < len; i++) {
      const currentDay = currentDays[i];
      const compareDay = compareDays[i];
      points.push({
        key: String(i + 1),
        label: currentDay
          ? dayAxisLabel(currentDay)
          : compareDay
            ? dayAxisLabel(compareDay)
            : String(i + 1),
        currentDate: currentDay ?? null,
        compareDate: compareDay ?? null,
        currentPence: currentDay ? (currentMap.get(currentDay) ?? 0) : 0,
        previousPence: compareDay ? (compareMap.get(compareDay) ?? 0) : 0,
      });
    }
    return toCumulativeSeries(points);
  }

  const currentMonths = eachMonth(input.from, input.to);
  const compareMonths = eachMonth(input.compareFrom, input.compareTo);
  const [currentMap, compareMap] = await Promise.all([
    outflowsByMonth(companyId, input.from, input.to),
    outflowsByMonth(companyId, input.compareFrom, input.compareTo),
  ]);

  const len = Math.max(currentMonths.length, compareMonths.length);
  const points: SpendingSeriesPoint[] = [];
  for (let i = 0; i < len; i++) {
    const currentMonth = currentMonths[i];
    const compareMonth = compareMonths[i];
    points.push({
      key: String(i + 1),
      label: currentMonth
        ? monthAxisLabel(currentMonth)
        : compareMonth
          ? monthAxisLabel(compareMonth)
          : String(i + 1),
      currentDate: currentMonth ?? null,
      compareDate: compareMonth ?? null,
      currentPence: currentMonth ? (currentMap.get(currentMonth) ?? 0) : 0,
      previousPence: compareMonth ? (compareMap.get(compareMonth) ?? 0) : 0,
    });
  }
  return toCumulativeSeries(points);
}

export async function getTopSpending(
  companyId: string,
  input: {
    from: string;
    to: string;
    groupBy: "category" | "merchant";
    limit?: number;
  },
): Promise<TopSpendingRow[]> {
  const db = getDb();
  const limit = input.limit ?? 10;

  const groupColumn =
    input.groupBy === "category"
      ? bankTransactions.spendingCategory
      : bankTransactions.counterparty;

  const rows = await db
    .select({
      key: groupColumn,
      total: sum(sql<number>`abs(${bankTransactions.amountPence})`).mapWith(Number),
    })
    .from(bankTransactions)
    .innerJoin(bankAccounts, eq(bankTransactions.bankAccountId, bankAccounts.id))
    .where(
      and(
        eq(bankAccounts.companyId, companyId),
        lt(bankTransactions.amountPence, 0),
        gte(bankTransactions.bookedAt, input.from),
        lte(bankTransactions.bookedAt, input.to),
      ),
    )
    .groupBy(groupColumn)
    .orderBy(desc(sum(sql<number>`abs(${bankTransactions.amountPence})`)))
    .limit(limit);

  const periodTotal = await sumOutflows(companyId, input.from, input.to);

  return rows.map((row, index) => {
    const totalPence = row.total ?? 0;
    const rawKey = row.key ?? "";
    const label =
      input.groupBy === "category"
        ? rawKey.trim()
          ? formatBankCategory(rawKey)
          : "Uncategorised"
        : rawKey.trim() || "Unknown";
    const sharePercent = periodTotal > 0 ? Math.round((totalPence / periodTotal) * 1000) / 10 : 0;
    return {
      rank: index + 1,
      key: rawKey || (input.groupBy === "category" ? "__uncategorised" : "__unknown"),
      label,
      totalPence,
      totalFormatted: formatGBP(totalPence),
      sharePercent,
    };
  });
}

export async function hasSpendingOutflows(
  companyId: string,
  from: string,
  to: string,
): Promise<boolean> {
  const total = await sumOutflows(companyId, from, to);
  return total > 0;
}
