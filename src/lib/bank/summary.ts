import "server-only";
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import type { BankListParams } from "@/lib/bank/list-params";
import { bankListWhere } from "@/lib/bank/queries";
import type { BankTransactionSummaryData } from "@/lib/bank/summary-types";
import { getDb } from "@/db";
import { bankTransactions, reconciliationMatches } from "@/db/schema";
import { formatGBP, poundsToPence } from "@/lib/money";

export type BankTransactionSummary = BankTransactionSummaryData;

function parseStatementBalancePence(raw: unknown): number | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, string>;
  for (const [key, value] of Object.entries(record)) {
    if (/balance/i.test(key) && value?.trim()) {
      try {
        return poundsToPence(value);
      } catch {
        return null;
      }
    }
  }
  return null;
}

function formatSummaryPeriod(from: string, to: string): string {
  const fmt = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  if (from && to) return `${fmt(from)} – ${fmt(to)}`;
  if (from) return `From ${fmt(from)}`;
  if (to) return `Through ${fmt(to)}`;
  return "All imported transactions";
}

export async function getBankTransactionSummary(
  filters: Partial<
    Pick<BankListParams, "q" | "type" | "category" | "reconciliation" | "from" | "to">
  >,
): Promise<BankTransactionSummary> {
  const db = getDb();
  const where = bankListWhere(filters);

  const [totals] = await db
    .select({
      incomingPence: sql<number>`COALESCE(SUM(CASE WHEN ${bankTransactions.amountPence} > 0 THEN ${bankTransactions.amountPence} ELSE 0 END), 0)`.mapWith(
        Number,
      ),
      outgoingPence: sql<number>`COALESCE(SUM(CASE WHEN ${bankTransactions.amountPence} < 0 THEN ABS(${bankTransactions.amountPence}) ELSE 0 END), 0)`.mapWith(
        Number,
      ),
      netPence: sql<number>`COALESCE(SUM(${bankTransactions.amountPence}), 0)`.mapWith(Number),
      totalCount: count(),
      incomingCount: sql<number>`COUNT(*) FILTER (WHERE ${bankTransactions.amountPence} > 0)`.mapWith(
        Number,
      ),
      outgoingCount: sql<number>`COUNT(*) FILTER (WHERE ${bankTransactions.amountPence} < 0)`.mapWith(
        Number,
      ),
      maxIncoming: sql<number | null>`MAX(CASE WHEN ${bankTransactions.amountPence} > 0 THEN ${bankTransactions.amountPence} END)`.mapWith(
        Number,
      ),
      maxOutgoing: sql<number | null>`MAX(CASE WHEN ${bankTransactions.amountPence} < 0 THEN ABS(${bankTransactions.amountPence}) END)`.mapWith(
        Number,
      ),
    })
    .from(bankTransactions)
    .where(where);

  const [unreconciledRow] = await db
    .select({ total: count() })
    .from(bankTransactions)
    .leftJoin(
      reconciliationMatches,
      and(
        eq(reconciliationMatches.bankTransactionId, bankTransactions.id),
        eq(reconciliationMatches.confirmed, true),
      ),
    )
    .where(where ? and(where, isNull(reconciliationMatches.id)) : isNull(reconciliationMatches.id));

  const [latest] = await db
    .select({
      raw: bankTransactions.raw,
      bookedAt: bankTransactions.bookedAt,
    })
    .from(bankTransactions)
    .orderBy(desc(bankTransactions.bookedAt), desc(bankTransactions.createdAt))
    .limit(1);

  const incomingPence = totals?.incomingPence ?? 0;
  const outgoingPence = totals?.outgoingPence ?? 0;
  const netPence = totals?.netPence ?? 0;
  const totalCount = totals?.totalCount ?? 0;
  const incomingCount = totals?.incomingCount ?? 0;
  const outgoingCount = totals?.outgoingCount ?? 0;
  const unreconciledCount = unreconciledRow?.total ?? 0;
  const matchedCount = totalCount - unreconciledCount;
  const flowTotal = incomingPence + outgoingPence;

  const pieSlices: BankTransactionSummaryData["pieSlices"] = [];
  if (incomingPence > 0) {
    pieSlices.push({
      name: "Incoming",
      pence: incomingPence,
      formatted: formatGBP(incomingPence),
      percent: flowTotal > 0 ? Math.round((incomingPence / flowTotal) * 1000) / 10 : 0,
    });
  }
  if (outgoingPence > 0) {
    pieSlices.push({
      name: "Outgoing",
      pence: outgoingPence,
      formatted: formatGBP(outgoingPence),
      percent: flowTotal > 0 ? Math.round((outgoingPence / flowTotal) * 1000) / 10 : 0,
    });
  }

  const statementBalancePence = latest ? parseStatementBalancePence(latest.raw) : null;
  const maxIncoming = totals?.maxIncoming ?? null;
  const maxOutgoing = totals?.maxOutgoing ?? null;

  return {
    periodLabel: formatSummaryPeriod(filters.from ?? "", filters.to ?? ""),
    incomingPence,
    outgoingPence,
    netPence,
    incomingFormatted: formatGBP(incomingPence),
    outgoingFormatted: formatGBP(outgoingPence),
    netFormatted: formatGBP(Math.abs(netPence)),
    totalCount,
    incomingCount,
    outgoingCount,
    matchedCount,
    unreconciledCount,
    reconciledPercent:
      totalCount > 0 ? Math.round((matchedCount / totalCount) * 1000) / 10 : 0,
    largestIncomingPence: maxIncoming,
    largestOutgoingPence: maxOutgoing,
    largestIncomingFormatted: maxIncoming != null ? formatGBP(maxIncoming) : null,
    largestOutgoingFormatted: maxOutgoing != null ? formatGBP(maxOutgoing) : null,
    statementBalancePence,
    statementBalanceFormatted:
      statementBalancePence != null ? formatGBP(statementBalancePence) : null,
    statementBalanceDate: latest?.bookedAt ?? null,
    pieSlices,
  };
}
