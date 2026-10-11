import "server-only";
import { and, eq, gte, isNotNull, lte, sql, sum } from "drizzle-orm";
import { getDb } from "@/db";
import { creditNotes } from "@/db/schema";

/**
 * Period totals for issued credit notes, by credit note issue date. Reports
 * subtract these from invoiced income and output VAT (accrual basis).
 */
export async function sumCreditNotesInPeriod(
  companyId: string,
  from: string,
  to: string,
): Promise<{ netPence: number; vatPence: number; grossPence: number }> {
  const db = getDb();
  const [row] = await db
    .select({
      net: sum(creditNotes.netPence).mapWith(Number),
      vat: sum(creditNotes.vatPence).mapWith(Number),
      gross: sum(creditNotes.grossPence).mapWith(Number),
    })
    .from(creditNotes)
    .where(
      and(
        eq(creditNotes.companyId, companyId),
        eq(creditNotes.status, "issued"),
        gte(creditNotes.issueDate, from),
        lte(creditNotes.issueDate, to),
      ),
    );
  return {
    netPence: row?.net ?? 0,
    vatPence: row?.vat ?? 0,
    grossPence: row?.gross ?? 0,
  };
}

/** Issued credit note net and gross totals keyed by YYYY-MM of issue date. */
export async function creditNotesByMonth(
  companyId: string,
  from: string,
  to: string,
): Promise<Map<string, { netPence: number; grossPence: number }>> {
  const db = getDb();
  const month = sql<string>`to_char(${creditNotes.issueDate}, 'YYYY-MM')`;
  const rows = await db
    .select({
      month,
      net: sum(creditNotes.netPence).mapWith(Number),
      gross: sum(creditNotes.grossPence).mapWith(Number),
    })
    .from(creditNotes)
    .where(
      and(
        eq(creditNotes.companyId, companyId),
        eq(creditNotes.status, "issued"),
        gte(creditNotes.issueDate, from),
        lte(creditNotes.issueDate, to),
      ),
    )
    .groupBy(month);
  return new Map(
    rows.map((r) => [r.month, { netPence: r.net ?? 0, grossPence: r.gross ?? 0 }]),
  );
}

/** Refunds paid to clients in the period, by refund date. */
export async function sumRefundsInPeriod(
  companyId: string,
  from: string,
  to: string,
): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ total: sum(creditNotes.refundedPence).mapWith(Number) })
    .from(creditNotes)
    .where(
      and(
        eq(creditNotes.companyId, companyId),
        eq(creditNotes.status, "issued"),
        isNotNull(creditNotes.refundedAt),
        gte(creditNotes.refundedAt, from),
        lte(creditNotes.refundedAt, to),
      ),
    );
  return row?.total ?? 0;
}

/** Refunds keyed by YYYY-MM of refund date. */
export async function refundsByMonth(
  companyId: string,
  from: string,
  to: string,
): Promise<Map<string, number>> {
  const db = getDb();
  const month = sql<string>`to_char(${creditNotes.refundedAt}, 'YYYY-MM')`;
  const rows = await db
    .select({ month, total: sum(creditNotes.refundedPence).mapWith(Number) })
    .from(creditNotes)
    .where(
      and(
        eq(creditNotes.companyId, companyId),
        eq(creditNotes.status, "issued"),
        isNotNull(creditNotes.refundedAt),
        gte(creditNotes.refundedAt, from),
        lte(creditNotes.refundedAt, to),
      ),
    )
    .groupBy(month);
  return new Map(rows.map((r) => [r.month, r.total ?? 0]));
}

/**
 * Subtract monthly credit amounts from a sorted month series. Months with only
 * credits are added (as negatives) so the series stays complete.
 */
export function subtractByMonth(
  series: Array<{ month: string; totalPence: number }>,
  credits: Map<string, number>,
): Array<{ month: string; totalPence: number }> {
  const merged = new Map(series.map((r) => [r.month, r.totalPence]));
  for (const [month, pence] of credits) {
    merged.set(month, (merged.get(month) ?? 0) - pence);
  }
  return [...merged.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, totalPence]) => ({ month, totalPence }));
}
