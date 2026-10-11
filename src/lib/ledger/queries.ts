import "server-only";
import { and, asc, desc, eq, gt, gte, inArray, lte, ne, or, sql, sum } from "drizzle-orm";
import { getDb } from "@/db";
import {
  companies,
  directorLoanEntries,
  dividendDeclarations,
  expenses,
  invoices,
  reimbursements,
  users,
} from "@/db/schema";
import { financialYearEndDate, financialYearStartDate, todayIsoDate } from "@/lib/dates";
import { addDays } from "@/lib/ledger/corporation-tax";
import { directorLoanWarnings } from "@/lib/ledger/director-loan";
import { buildReservesSchedule, type ReservesYearInput } from "@/lib/ledger/reserves";
import { getProfitAndLoss } from "@/lib/reports/queries";

/** Never walk back more than this many years when there are no opening balances. */
const MAX_YEARS = 12;

export async function getLedgerSettings(companyId: string) {
  const db = getDb();
  const [row] = await db
    .select({
      entityType: companies.entityType,
      financialYearEndMonth: companies.financialYearEndMonth,
      openingBalancesAsAt: companies.openingBalancesAsAt,
      openingReservesPence: companies.openingReservesPence,
      associatedCompanies: companies.associatedCompanies,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!row) throw new Error("Company not found");
  return row;
}

/** Whether `date` is the last day of a financial year for this year-end month. */
export function isFinancialYearEnd(fyEndMonth: number, date: string): boolean {
  return financialYearEndDate(fyEndMonth, date) === date;
}

async function earliestRecordDate(companyId: string): Promise<string | null> {
  const db = getDb();
  const [inv] = await db
    .select({ d: sql<string | null>`min(${invoices.issueDate})` })
    .from(invoices)
    .where(and(eq(invoices.companyId, companyId), ne(invoices.status, "draft")));
  const [exp] = await db
    .select({ d: sql<string | null>`min(${expenses.spentAt})` })
    .from(expenses)
    .where(and(eq(expenses.companyId, companyId), ne(expenses.status, "pending")));
  const [div] = await db
    .select({ d: sql<string | null>`min(${dividendDeclarations.declaredAt})` })
    .from(dividendDeclarations)
    .where(eq(dividendDeclarations.companyId, companyId));
  const dates = [inv?.d, exp?.d, div?.d].filter((d): d is string => Boolean(d));
  return dates.length ? dates.sort()[0]! : null;
}

async function sumDividendsPence(companyId: string, from: string, to: string) {
  const db = getDb();
  const [row] = await db
    .select({ total: sum(dividendDeclarations.totalPence).mapWith(Number) })
    .from(dividendDeclarations)
    .where(
      and(
        eq(dividendDeclarations.companyId, companyId),
        gte(dividendDeclarations.declaredAt, from),
        lte(dividendDeclarations.declaredAt, to),
      ),
    );
  return row?.total ?? 0;
}

/**
 * Retained earnings from the opening balances (or the first records) to the
 * financial year containing `asOf`. The last year's profit runs to `asOf`;
 * its dividends cover the whole year, so a backdated dividend never frees up
 * reserves already promised to a later one.
 */
export async function getReservesPosition(companyId: string, asOf: string = todayIsoDate()) {
  const settings = await getLedgerSettings(companyId);
  const fyEnd = settings.financialYearEndMonth;
  const currentStart = financialYearStartDate(fyEnd, asOf);

  let firstStart: string;
  if (settings.openingBalancesAsAt) {
    firstStart = addDays(settings.openingBalancesAsAt, 1);
  } else {
    const earliest = await earliestRecordDate(companyId);
    firstStart = earliest && earliest < currentStart
      ? financialYearStartDate(fyEnd, earliest)
      : currentStart;
  }

  const starts: string[] = [];
  for (let start = currentStart; start >= firstStart && starts.length < MAX_YEARS; ) {
    starts.unshift(start);
    start = financialYearStartDate(fyEnd, addDays(start, -1));
  }

  const inputs: ReservesYearInput[] = [];
  for (const start of starts) {
    const end = financialYearEndDate(fyEnd, start);
    const current = start === currentStart;
    const to = current && asOf < end ? asOf : end;
    const [pnl, dividendsPence] = await Promise.all([
      getProfitAndLoss(companyId, start, to),
      sumDividendsPence(companyId, start, end),
    ]);
    inputs.push({ start, end, profitPence: pnl.profitPence, dividendsPence, current });
  }

  const years = buildReservesSchedule({
    openingReservesPence: settings.openingReservesPence ?? 0,
    years: inputs,
    associatedCompanies: settings.associatedCompanies,
  });
  const currentYear = years[years.length - 1]!;
  return {
    asOf,
    settings,
    hasOpeningBalances: settings.openingBalancesAsAt != null,
    years,
    currentYear,
    /** Estimated distributable reserves after this year's dividends. */
    availablePence: Math.max(0, currentYear.closingReservesPence),
  };
}

export type DirectorLoanSummary = {
  userId: string;
  name: string;
  openingPence: number;
  paidPersonallyPence: number;
  reimbursedPence: number;
  drawingsPence: number;
  paidInPence: number;
  balancePence: number;
};

function bySum<T extends { userId: string | null; total: number | null }>(rows: T[]) {
  return new Map(rows.filter((r) => r.userId).map((r) => [r.userId!, r.total ?? 0]));
}

/**
 * Director's loan account balances at `asOf`. Positive: the company owes the
 * director. Negative: the director owes the company (overdrawn). Activity on
 * or before the opening balances date is already in the opening balance.
 */
export async function getDirectorLoanBalances(
  companyId: string,
  asOf: string,
  openingBalancesAsAt: string | null,
): Promise<DirectorLoanSummary[]> {
  const db = getDb();
  const after = openingBalancesAsAt ?? "0001-01-01";
  const paidOn = sql`(${reimbursements.paidAt} at time zone 'Europe/London')::date`;

  const [entryRows, expenseRows, reimbursedRows, directorRows] = await Promise.all([
    db
      .select({
        userId: directorLoanEntries.directorUserId,
        kind: directorLoanEntries.kind,
        total: sum(directorLoanEntries.amountPence).mapWith(Number),
      })
      .from(directorLoanEntries)
      .where(
        and(
          eq(directorLoanEntries.companyId, companyId),
          or(
            eq(directorLoanEntries.kind, "opening"),
            and(gt(directorLoanEntries.entryDate, after), lte(directorLoanEntries.entryDate, asOf)),
          ),
        ),
      )
      .groupBy(directorLoanEntries.directorUserId, directorLoanEntries.kind),
    db
      .select({
        userId: expenses.paidByUserId,
        total: sum(expenses.amountPence).mapWith(Number),
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.companyId, companyId),
          inArray(expenses.status, ["reimbursable", "reimbursed"]),
          gt(expenses.spentAt, after),
          lte(expenses.spentAt, asOf),
        ),
      )
      .groupBy(expenses.paidByUserId),
    db
      .select({
        userId: reimbursements.payeeUserId,
        total: sum(reimbursements.totalPence).mapWith(Number),
      })
      .from(reimbursements)
      .where(
        and(
          eq(reimbursements.companyId, companyId),
          eq(reimbursements.status, "paid"),
          sql`${paidOn} > ${after}`,
          sql`${paidOn} <= ${asOf}`,
        ),
      )
      .groupBy(reimbursements.payeeUserId),
    db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role })
      .from(users)
      .where(eq(users.companyId, companyId)),
  ]);

  const paidPersonally = bySum(expenseRows);
  const reimbursed = bySum(reimbursedRows);
  const entries = new Map<string, Record<string, number>>();
  for (const r of entryRows) {
    const byKind = entries.get(r.userId) ?? {};
    byKind[r.kind] = r.total ?? 0;
    entries.set(r.userId, byKind);
  }

  return directorRows
    .filter(
      (u) =>
        u.role === "admin" ||
        u.role === "user" ||
        entries.has(u.id) ||
        paidPersonally.has(u.id) ||
        reimbursed.has(u.id),
    )
    .map((u) => {
      const e = entries.get(u.id) ?? {};
      const openingPence = e.opening ?? 0;
      const drawingsPence = e.drawing ?? 0;
      const paidInPence = e.paid_in ?? 0;
      const paidPersonallyPence = paidPersonally.get(u.id) ?? 0;
      const reimbursedPence = reimbursed.get(u.id) ?? 0;
      return {
        userId: u.id,
        name: u.name || u.email,
        openingPence,
        paidPersonallyPence,
        reimbursedPence,
        drawingsPence,
        paidInPence,
        balancePence:
          openingPence + paidPersonallyPence - reimbursedPence - drawingsPence + paidInPence,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Each director's account now, with the s455 position at the year ends. */
export async function getDirectorLoanAccounts(companyId: string, today: string = todayIsoDate()) {
  const settings = await getLedgerSettings(companyId);
  const fyEnd = settings.financialYearEndMonth;
  const currentYearEnd = financialYearEndDate(fyEnd, today);
  const lastYearEnd = addDays(financialYearStartDate(fyEnd, today), -1);
  const lastYearCovered =
    !settings.openingBalancesAsAt || settings.openingBalancesAsAt <= lastYearEnd;

  const [now, atYearEnd] = await Promise.all([
    getDirectorLoanBalances(companyId, today, settings.openingBalancesAsAt),
    lastYearCovered
      ? getDirectorLoanBalances(companyId, lastYearEnd, settings.openingBalancesAsAt)
      : Promise.resolve([]),
  ]);
  const yearEndBalance = new Map(atYearEnd.map((d) => [d.userId, d.balancePence]));

  return {
    settings,
    currentYearEnd,
    lastYearEnd,
    directors: now.map((d) => ({
      ...d,
      balanceAtLastYearEndPence: yearEndBalance.get(d.userId) ?? 0,
      warnings: directorLoanWarnings({
        balancePence: d.balancePence,
        lastYearEnd: lastYearCovered ? lastYearEnd : null,
        balanceAtLastYearEndPence: yearEndBalance.get(d.userId) ?? 0,
        currentYearEnd,
        today,
      }),
    })),
  };
}

export async function listDirectorLoanEntries(companyId: string, limit = 100) {
  const db = getDb();
  return db
    .select({
      id: directorLoanEntries.id,
      directorUserId: directorLoanEntries.directorUserId,
      directorName: sql<string>`coalesce(${users.name}, ${users.email})`,
      kind: directorLoanEntries.kind,
      entryDate: directorLoanEntries.entryDate,
      amountPence: directorLoanEntries.amountPence,
      description: directorLoanEntries.description,
    })
    .from(directorLoanEntries)
    .innerJoin(users, eq(directorLoanEntries.directorUserId, users.id))
    .where(
      and(eq(directorLoanEntries.companyId, companyId), ne(directorLoanEntries.kind, "opening")),
    )
    .orderBy(desc(directorLoanEntries.entryDate), asc(directorLoanEntries.createdAt))
    .limit(limit);
}

export async function listDirectorOpeningBalances(companyId: string) {
  const db = getDb();
  return db
    .select({
      directorUserId: directorLoanEntries.directorUserId,
      amountPence: directorLoanEntries.amountPence,
    })
    .from(directorLoanEntries)
    .where(
      and(eq(directorLoanEntries.companyId, companyId), eq(directorLoanEntries.kind, "opening")),
    );
}
