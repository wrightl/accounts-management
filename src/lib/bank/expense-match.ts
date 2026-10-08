/**
 * Expense ↔ bank debit matching.
 * Sterling: exact pence + 90 calendar days (shared scorer).
 * Foreign: ±3 England & Wales working days + ±10% of BoE rate on spentAt.
 */

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  bankAccounts,
  bankTransactions,
  expenses,
  reconciliationMatches,
} from "@/db/schema";
import { isForeignCurrency } from "@/lib/expenses/receipt-parse";
import {
  bankAmountWithinFxBand,
  buildFxAmountBand,
  buildFxMatchNote,
  FX_WORKING_DAY_WINDOW,
  type FxAmountBand,
} from "@/lib/bank/fx";
import {
  dateDiffDays,
  DATE_WINDOW_DAYS,
  MIN_SUGGEST_SCORE,
  type BankTxLike,
  type MatchScoreBreakdown,
} from "@/lib/bank/match";
import { fuzzyIncludes } from "@/lib/bank/fuzzy";
import { withinWorkingDayWindow } from "@/lib/bank/working-days";

export const EXPENSE_MATCH_STATUSES = [
  "pending",
  "recorded",
  "company_paid",
] as const;

export type ExpenseMatchStatus = (typeof EXPENSE_MATCH_STATUSES)[number];

export type ExpenseMatchCandidate = {
  id: string;
  amountPence: number;
  date: string;
  description: string | null;
  detectedCurrency: string | null;
  status: string;
  mileageMiles: number | null;
};

export type ExpenseMatchResult = {
  expenseId: string;
  bankTransactionId: string;
  score: number;
  breakdown: MatchScoreBreakdown;
  note: string | null;
  fxBand: FxAmountBand | null;
};

function emptyBreakdown(): MatchScoreBreakdown {
  return {
    dateScore: 0,
    invoiceRefScore: 0,
    paymentRefScore: 0,
    counterpartyScore: 0,
    total: 0,
  };
}

/** Date decay used by the sterling path (0–100). */
function dateScoreForCalendarGap(days: number): number {
  if (days > DATE_WINDOW_DAYS) return 0;
  return Math.max(0, 100 - days * 2);
}

/**
 * Expense scoring haystack includes counterparty — card feeds put the
 * merchant there, which the general invoice scorer leaves out of refs.
 */
function expenseTextHaystack(tx: BankTxLike): string {
  return `${tx.reference ?? ""} ${tx.description ?? ""} ${tx.counterparty ?? ""}`;
}

function textScores(
  tx: BankTxLike,
  description: string | null,
): Pick<MatchScoreBreakdown, "paymentRefScore" | "counterpartyScore"> {
  if (!description?.trim()) {
    return { paymentRefScore: 0, counterpartyScore: 0 };
  }
  const paymentRefScore = fuzzyIncludes(expenseTextHaystack(tx), description);
  return { paymentRefScore, counterpartyScore: 0 };
}

function totalFromParts(
  dateScore: number,
  paymentRefScore: number,
): MatchScoreBreakdown {
  const total =
    dateScore + Math.round((paymentRefScore / 100) * 20);
  return {
    dateScore,
    invoiceRefScore: 0,
    paymentRefScore,
    counterpartyScore: 0,
    total,
  };
}

export function isExpenseEligibleForBankMatch(
  expense: Pick<
    ExpenseMatchCandidate,
    "status" | "amountPence" | "date" | "mileageMiles"
  > & { spentAt?: string | null },
): boolean {
  const status = expense.status;
  if (
    status !== "pending" &&
    status !== "recorded" &&
    status !== "company_paid"
  ) {
    return false;
  }
  if (expense.mileageMiles != null) return false;
  if (expense.amountPence <= 0) return false;
  const date = expense.date || expense.spentAt;
  if (!date) return false;
  return true;
}

/**
 * Score a bank debit against an expense.
 * For foreign currency, pass a pre-resolved FX band (or null to reject).
 */
export function scoreExpenseBankMatch(
  tx: BankTxLike,
  expense: {
    amountPence: number;
    date: string;
    description: string | null;
    detectedCurrency: string | null;
  },
  fxBand: FxAmountBand | null,
): MatchScoreBreakdown {
  if (tx.amountPence >= 0) return emptyBreakdown();

  const foreign = isForeignCurrency(expense.detectedCurrency);

  if (foreign) {
    if (!fxBand) return emptyBreakdown();
    if (
      !withinWorkingDayWindow(
        expense.date,
        tx.bookedAt,
        FX_WORKING_DAY_WINDOW,
      )
    ) {
      return emptyBreakdown();
    }
    if (!bankAmountWithinFxBand(tx.amountPence, fxBand)) {
      return emptyBreakdown();
    }
    const calendarDays = Math.abs(dateDiffDays(expense.date, tx.bookedAt));
    const dateScore = dateScoreForCalendarGap(calendarDays);
    if (dateScore === 0) return emptyBreakdown();
    const { paymentRefScore } = textScores(tx, expense.description);
    return totalFromParts(dateScore, paymentRefScore);
  }

  // Sterling: exact pence + 90 calendar days.
  if (Math.abs(tx.amountPence) !== expense.amountPence) {
    return emptyBreakdown();
  }
  const days = Math.abs(dateDiffDays(expense.date, tx.bookedAt));
  const dateScore = dateScoreForCalendarGap(days);
  if (dateScore === 0) return emptyBreakdown();
  const { paymentRefScore } = textScores(tx, expense.description);
  return totalFromParts(dateScore, paymentRefScore);
}

type Ranked = {
  expenseId: string;
  bankTransactionId: string;
  score: number;
  breakdown: MatchScoreBreakdown;
  note: string | null;
  fxBand: FxAmountBand | null;
  amountDelta: number;
  dateDelta: number;
};

function pickBestRanked(candidates: Ranked[]): Ranked | null {
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.amountDelta !== b.amountDelta) return a.amountDelta - b.amountDelta;
    return a.dateDelta - b.dateDelta;
  });
  const best = candidates[0];
  if (best.score < MIN_SUGGEST_SCORE) return null;
  return best;
}

async function loadUnmatchedOutgoing(
  companyId: string,
): Promise<(typeof bankTransactions.$inferSelect)[]> {
  const db = getDb();
  const rows = await db
    .select({ tx: bankTransactions })
    .from(bankTransactions)
    .innerJoin(
      bankAccounts,
      eq(bankTransactions.bankAccountId, bankAccounts.id),
    )
    .leftJoin(
      reconciliationMatches,
      eq(reconciliationMatches.bankTransactionId, bankTransactions.id),
    )
    .where(
      and(
        eq(bankAccounts.companyId, companyId),
        isNull(reconciliationMatches.id),
        sql`${bankTransactions.amountPence} < 0`,
      ),
    );
  return rows.map((r) => r.tx);
}

async function loadEligibleExpenses(
  companyId: string,
  opts?: { exactAmountPence?: number },
): Promise<ExpenseMatchCandidate[]> {
  const db = getDb();
  const conditions = [
    eq(expenses.companyId, companyId),
    inArray(expenses.status, [...EXPENSE_MATCH_STATUSES]),
    sql`${expenses.amountPence} > 0`,
    sql`${expenses.spentAt} is not null`,
    isNull(expenses.mileageMiles),
  ];
  if (opts?.exactAmountPence != null) {
    conditions.push(eq(expenses.amountPence, opts.exactAmountPence));
  }

  const rows = await db
    .select({
      id: expenses.id,
      amountPence: expenses.amountPence,
      date: expenses.spentAt,
      description: expenses.description,
      detectedCurrency: expenses.detectedCurrency,
      status: expenses.status,
      mileageMiles: expenses.mileageMiles,
    })
    .from(expenses)
    .where(and(...conditions));

  return rows
    .filter((r) => r.date)
    .map((r) => ({
      id: r.id,
      amountPence: r.amountPence,
      date: r.date as string,
      description: r.description,
      detectedCurrency: r.detectedCurrency,
      status: r.status,
      mileageMiles: r.mileageMiles,
    }));
}

async function expenseIdsAlreadyMatched(
  expenseIds: string[],
): Promise<Set<string>> {
  if (expenseIds.length === 0) return new Set();
  const db = getDb();
  const rows = await db
    .select({ expenseId: reconciliationMatches.expenseId })
    .from(reconciliationMatches)
    .where(
      and(
        inArray(reconciliationMatches.expenseId, expenseIds),
        sql`${reconciliationMatches.expenseId} is not null`,
      ),
    );
  return new Set(
    rows
      .map((r) => r.expenseId)
      .filter((id): id is string => typeof id === "string"),
  );
}

async function resolveBandForExpense(
  expense: ExpenseMatchCandidate,
): Promise<FxAmountBand | null> {
  if (!isForeignCurrency(expense.detectedCurrency)) return null;
  return buildFxAmountBand(
    expense.amountPence,
    expense.detectedCurrency!,
    expense.date,
  );
}

/**
 * Find the best unmatched outgoing bank debit for one expense.
 */
export async function findBankMatchForExpense(
  companyId: string,
  expense: ExpenseMatchCandidate,
): Promise<ExpenseMatchResult | null> {
  if (!isExpenseEligibleForBankMatch(expense)) return null;

  const matched = await expenseIdsAlreadyMatched([expense.id]);
  if (matched.has(expense.id)) return null;

  const txs = await loadUnmatchedOutgoing(companyId);
  if (txs.length === 0) return null;

  const foreign = isForeignCurrency(expense.detectedCurrency);
  const fxBand = foreign ? await resolveBandForExpense(expense) : null;
  if (foreign && !fxBand) return null;

  const ranked: Ranked[] = [];
  for (const tx of txs) {
    const breakdown = scoreExpenseBankMatch(
      {
        amountPence: tx.amountPence,
        bookedAt: tx.bookedAt,
        reference: tx.reference,
        description: tx.description,
        counterparty: tx.counterparty,
      },
      expense,
      fxBand,
    );
    if (breakdown.total < MIN_SUGGEST_SCORE) continue;
    ranked.push({
      expenseId: expense.id,
      bankTransactionId: tx.id,
      score: breakdown.total,
      breakdown,
      note: fxBand
        ? buildFxMatchNote(
            expense.detectedCurrency!.toUpperCase(),
            fxBand,
            tx.amountPence,
          )
        : null,
      fxBand,
      amountDelta: Math.abs(Math.abs(tx.amountPence) - (fxBand?.expectedGbpPence ?? expense.amountPence)),
      dateDelta: Math.abs(dateDiffDays(expense.date, tx.bookedAt)),
    });
  }

  const best = pickBestRanked(ranked);
  if (!best) return null;
  return {
    expenseId: best.expenseId,
    bankTransactionId: best.bankTransactionId,
    score: best.score,
    breakdown: best.breakdown,
    note: best.note,
    fxBand: best.fxBand,
  };
}

/**
 * Find the best eligible expense for one outgoing bank debit.
 */
export async function findExpenseMatchForBankTx(
  companyId: string,
  tx: {
    id: string;
    amountPence: number;
    bookedAt: string;
    reference: string | null;
    description: string | null;
    counterparty: string | null;
  },
): Promise<ExpenseMatchResult | null> {
  if (tx.amountPence >= 0) return null;

  const amount = Math.abs(tx.amountPence);

  // Load sterling candidates by exact amount, plus all foreign eligible expenses.
  const [sterling, allEligible] = await Promise.all([
    loadEligibleExpenses(companyId, { exactAmountPence: amount }),
    loadEligibleExpenses(companyId),
  ]);

  const foreign = allEligible.filter((e) =>
    isForeignCurrency(e.detectedCurrency),
  );
  const byId = new Map<string, ExpenseMatchCandidate>();
  for (const e of sterling) {
    if (!isForeignCurrency(e.detectedCurrency)) byId.set(e.id, e);
  }
  for (const e of foreign) byId.set(e.id, e);

  const candidates = [...byId.values()];
  const already = await expenseIdsAlreadyMatched(candidates.map((c) => c.id));
  const open = candidates.filter((c) => !already.has(c.id));
  if (open.length === 0) return null;

  const ranked: Ranked[] = [];
  for (const expense of open) {
    const isFx = isForeignCurrency(expense.detectedCurrency);
    const fxBand = isFx ? await resolveBandForExpense(expense) : null;
    if (isFx && !fxBand) continue;

    const breakdown = scoreExpenseBankMatch(
      {
        amountPence: tx.amountPence,
        bookedAt: tx.bookedAt,
        reference: tx.reference,
        description: tx.description,
        counterparty: tx.counterparty,
      },
      expense,
      fxBand,
    );
    if (breakdown.total < MIN_SUGGEST_SCORE) continue;
    ranked.push({
      expenseId: expense.id,
      bankTransactionId: tx.id,
      score: breakdown.total,
      breakdown,
      note: fxBand
        ? buildFxMatchNote(
            expense.detectedCurrency!.toUpperCase(),
            fxBand,
            tx.amountPence,
          )
        : null,
      fxBand,
      amountDelta: Math.abs(
        amount - (fxBand?.expectedGbpPence ?? expense.amountPence),
      ),
      dateDelta: Math.abs(dateDiffDays(expense.date, tx.bookedAt)),
    });
  }

  const best = pickBestRanked(ranked);
  if (!best) return null;
  return {
    expenseId: best.expenseId,
    bankTransactionId: best.bankTransactionId,
    score: best.score,
    breakdown: best.breakdown,
    note: best.note,
    fxBand: best.fxBand,
  };
}

/** Delete unconfirmed expense suggestions for this expense. */
export async function dismissUnconfirmedExpenseSuggestions(
  expenseId: string,
): Promise<void> {
  const db = getDb();
  await db
    .delete(reconciliationMatches)
    .where(
      and(
        eq(reconciliationMatches.expenseId, expenseId),
        eq(reconciliationMatches.confirmed, false),
        eq(reconciliationMatches.matchType, "expense"),
      ),
    );
}

/**
 * Drop any unconfirmed suggestion for the expense, then try to create a new one
 * against unmatched outgoing bank lines. Safe to call after create/update/approve.
 */
export async function refreshExpenseBankSuggestion(
  companyId: string,
  expenseId: string,
): Promise<ExpenseMatchResult | null> {
  await dismissUnconfirmedExpenseSuggestions(expenseId);

  const db = getDb();
  const [expense] = await db
    .select({
      id: expenses.id,
      amountPence: expenses.amountPence,
      date: expenses.spentAt,
      description: expenses.description,
      detectedCurrency: expenses.detectedCurrency,
      status: expenses.status,
      mileageMiles: expenses.mileageMiles,
    })
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.companyId, companyId)))
    .limit(1);

  if (!expense?.date) return null;
  const candidate: ExpenseMatchCandidate = {
    id: expense.id,
    amountPence: expense.amountPence,
    date: expense.date,
    description: expense.description,
    detectedCurrency: expense.detectedCurrency,
    status: expense.status,
    mileageMiles: expense.mileageMiles,
  };

  if (!isExpenseEligibleForBankMatch(candidate)) return null;

  const match = await findBankMatchForExpense(companyId, candidate);
  if (!match) return null;

  const [row] = await db
    .insert(reconciliationMatches)
    .values({
      bankTransactionId: match.bankTransactionId,
      matchType: "expense",
      expenseId: match.expenseId,
      confirmed: false,
      note: match.note,
    })
    .returning({ id: reconciliationMatches.id });

  return row ? match : null;
}

export function formatExpenseMatchTarget(description: string | null): string {
  return description?.trim() || "Expense";
}
