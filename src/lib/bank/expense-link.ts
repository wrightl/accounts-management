/**
 * Manual expense ↔ bank debit linking, for pairs the auto-matcher misses
 * (amount off by a tip or fee, dates far apart, a dismissed suggestion).
 * One expense per debit, as with confirmed suggestions.
 */

import "server-only";
import { and, eq, gt, gte, ilike, inArray, isNull, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import {
  bankAccounts,
  bankTransactions,
  expenses,
  reconciliationMatches,
} from "@/db/schema";
import { bankSearchPattern } from "@/lib/bank/list-params";
import { dateDiffDays } from "@/lib/bank/match";
import { isForeignCurrency } from "@/lib/expenses/receipt-parse";
import { addDays } from "@/lib/ledger/corporation-tax";
import { formatGBP } from "@/lib/money";
import { periodLockError } from "@/lib/period-lock";
import { getBooksLockedThrough } from "@/lib/period-lock-queries";

/**
 * Pending submissions still need review and reimbursable ones were paid
 * personally, so only business-paid expenses can be linked by hand.
 */
export const EXPENSE_LINK_STATUSES = ["recorded", "company_paid"] as const;

/** Without a search, candidates are limited to this many days either side. */
export const LINK_WINDOW_DAYS = 120;
export const LINK_CANDIDATE_LIMIT = 25;

export class ExpenseLinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpenseLinkError";
  }
}

export type ExpenseLinkCandidate = {
  expenseId: string;
  description: string;
  spentAt: string | null;
  amountFormatted: string;
  /** Non-GBP receipt currency; the amount difference is not meaningful then. */
  foreignCurrency: string | null;
  /** Expense minus bank amount in pence; null for foreign-currency expenses. */
  amountDeltaPence: number | null;
  dateGapDays: number | null;
};

export type BankDebitLinkCandidate = {
  bankTransactionId: string;
  bookedAt: string;
  amountFormatted: string;
  counterparty: string | null;
  reference: string | null;
  bankAccountName: string;
  amountDeltaPence: number | null;
  dateGapDays: number | null;
};

type Rankable = { amountDeltaPence: number | null; dateGapDays: number | null };

/** Closest amount first, then closest date; unknowns sort last. */
export function compareLinkCandidates(a: Rankable, b: Rankable): number {
  const amount = (c: Rankable) =>
    c.amountDeltaPence == null ? Number.MAX_SAFE_INTEGER : Math.abs(c.amountDeltaPence);
  const gap = (c: Rankable) =>
    c.dateGapDays == null ? Number.MAX_SAFE_INTEGER : c.dateGapDays;
  return amount(a) - amount(b) || gap(a) - gap(b);
}

export function linkAmountDelta(
  expense: { amountPence: number; detectedCurrency: string | null },
  bankAmountPence: number,
): number | null {
  if (isForeignCurrency(expense.detectedCurrency)) return null;
  return expense.amountPence - Math.abs(bankAmountPence);
}

function dateGap(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  return Math.abs(dateDiffDays(a, b));
}

const expenseHasConfirmedMatch = sql`EXISTS (
  SELECT 1 FROM ${reconciliationMatches}
  WHERE ${reconciliationMatches.expenseId} = ${expenses.id}
    AND ${reconciliationMatches.confirmed} = true
)`;

const bankTxHasConfirmedMatch = sql`EXISTS (
  SELECT 1 FROM ${reconciliationMatches}
  WHERE ${reconciliationMatches.bankTransactionId} = ${bankTransactions.id}
    AND ${reconciliationMatches.confirmed} = true
)`;

async function getCompanyBankTx(companyId: string, bankTransactionId: string) {
  const [row] = await getDb()
    .select({ tx: bankTransactions })
    .from(bankTransactions)
    .innerJoin(bankAccounts, eq(bankTransactions.bankAccountId, bankAccounts.id))
    .where(
      and(eq(bankTransactions.id, bankTransactionId), eq(bankAccounts.companyId, companyId)),
    )
    .limit(1);
  return row?.tx ?? null;
}

/** Expenses that could be attached to one outgoing bank debit, best first. */
export async function listExpenseCandidatesForBankTx(
  companyId: string,
  bankTransactionId: string,
  query?: string,
): Promise<ExpenseLinkCandidate[]> {
  const tx = await getCompanyBankTx(companyId, bankTransactionId);
  if (!tx || tx.amountPence >= 0) return [];

  const conditions: SQL[] = [
    eq(expenses.companyId, companyId),
    inArray(expenses.status, [...EXPENSE_LINK_STATUSES]),
    gt(expenses.amountPence, 0),
    isNull(expenses.mileageMiles),
    sql`NOT ${expenseHasConfirmedMatch}`,
  ];
  const pattern = query ? bankSearchPattern(query) : null;
  if (pattern) {
    conditions.push(ilike(expenses.description, pattern));
  } else {
    conditions.push(
      gte(expenses.spentAt, addDays(tx.bookedAt, -LINK_WINDOW_DAYS)),
      lte(expenses.spentAt, addDays(tx.bookedAt, LINK_WINDOW_DAYS)),
    );
  }

  const rows = await getDb()
    .select({
      id: expenses.id,
      description: expenses.description,
      spentAt: expenses.spentAt,
      amountPence: expenses.amountPence,
      detectedCurrency: expenses.detectedCurrency,
    })
    .from(expenses)
    .where(and(...conditions));

  return rows
    .map((e) => ({
      expenseId: e.id,
      description: e.description,
      spentAt: e.spentAt,
      amountFormatted: formatGBP(e.amountPence),
      foreignCurrency: isForeignCurrency(e.detectedCurrency)
        ? e.detectedCurrency!.toUpperCase()
        : null,
      amountDeltaPence: linkAmountDelta(e, tx.amountPence),
      dateGapDays: dateGap(e.spentAt, tx.bookedAt),
    }))
    .sort(compareLinkCandidates)
    .slice(0, LINK_CANDIDATE_LIMIT);
}

/** Outgoing bank debits one expense could be linked to, best first. */
export async function listBankDebitCandidatesForExpense(
  companyId: string,
  expenseId: string,
  query?: string,
): Promise<BankDebitLinkCandidate[]> {
  const db = getDb();
  const [expense] = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.companyId, companyId)))
    .limit(1);
  if (!expense || !isExpenseLinkable(expense)) return [];

  const conditions: SQL[] = [
    eq(bankAccounts.companyId, companyId),
    lt(bankTransactions.amountPence, 0),
    sql`NOT ${bankTxHasConfirmedMatch}`,
  ];
  // Locked rows can't be reconciled, so don't offer them.
  const lockedThrough = await getBooksLockedThrough(companyId);
  if (lockedThrough) conditions.push(gt(bankTransactions.bookedAt, lockedThrough));
  const pattern = query ? bankSearchPattern(query) : null;
  if (pattern) {
    conditions.push(
      or(
        ilike(bankTransactions.counterparty, pattern),
        ilike(bankTransactions.reference, pattern),
        ilike(bankTransactions.description, pattern),
      )!,
    );
  } else if (expense.spentAt) {
    conditions.push(
      gte(bankTransactions.bookedAt, addDays(expense.spentAt, -LINK_WINDOW_DAYS)),
      lte(bankTransactions.bookedAt, addDays(expense.spentAt, LINK_WINDOW_DAYS)),
    );
  }

  const rows = await db
    .select({
      id: bankTransactions.id,
      bookedAt: bankTransactions.bookedAt,
      amountPence: bankTransactions.amountPence,
      counterparty: bankTransactions.counterparty,
      reference: bankTransactions.reference,
      description: bankTransactions.description,
      bankAccountName: bankAccounts.name,
    })
    .from(bankTransactions)
    .innerJoin(bankAccounts, eq(bankTransactions.bankAccountId, bankAccounts.id))
    .where(and(...conditions));

  return rows
    .map((t) => ({
      bankTransactionId: t.id,
      bookedAt: t.bookedAt,
      amountFormatted: formatGBP(Math.abs(t.amountPence)),
      counterparty: t.counterparty ?? t.description,
      reference: t.reference,
      bankAccountName: t.bankAccountName,
      amountDeltaPence: linkAmountDelta(expense, t.amountPence),
      dateGapDays: dateGap(expense.spentAt, t.bookedAt),
    }))
    .sort(compareLinkCandidates)
    .slice(0, LINK_CANDIDATE_LIMIT);
}

export function isExpenseLinkable(expense: {
  status: string;
  amountPence: number;
  mileageMiles: number | null;
}): boolean {
  return (
    (EXPENSE_LINK_STATUSES as readonly string[]).includes(expense.status) &&
    expense.amountPence > 0 &&
    expense.mileageMiles == null
  );
}

/**
 * Why a debit can't take an expense, or null when it can. Checked before
 * creating an expense from a transaction, so the expense isn't orphaned.
 */
export async function bankDebitLinkError(
  companyId: string,
  bankTransactionId: string,
): Promise<string | null> {
  const tx = await getCompanyBankTx(companyId, bankTransactionId);
  if (!tx) return "Bank transaction not found";
  if (tx.amountPence >= 0) return "Only outgoing payments can be linked to an expense";
  const locked = periodLockError(await getBooksLockedThrough(companyId), tx.bookedAt);
  if (locked) return locked;
  const [confirmed] = await getDb()
    .select({ id: reconciliationMatches.id })
    .from(reconciliationMatches)
    .where(
      and(
        eq(reconciliationMatches.bankTransactionId, bankTransactionId),
        eq(reconciliationMatches.confirmed, true),
      ),
    )
    .limit(1);
  return confirmed ? "This transaction is already reconciled" : null;
}

/**
 * Link an expense to a bank debit as a confirmed match, replacing any
 * pending suggestions on either side. Like confirming a suggestion, it marks
 * the expense as paid by the company.
 */
export async function linkExpenseToBankTx(
  companyId: string,
  input: { expenseId: string; bankTransactionId: string },
): Promise<{ matchId: string }> {
  const { expenseId, bankTransactionId } = input;
  return getDb().transaction(async (db) => {
    // Lock both rows so two people can't link the same pair twice.
    const [txRow] = await db
      .select({ tx: bankTransactions })
      .from(bankTransactions)
      .innerJoin(bankAccounts, eq(bankTransactions.bankAccountId, bankAccounts.id))
      .where(
        and(eq(bankTransactions.id, bankTransactionId), eq(bankAccounts.companyId, companyId)),
      )
      .for("update", { of: bankTransactions })
      .limit(1);
    const tx = txRow?.tx;
    if (!tx) throw new ExpenseLinkError("Bank transaction not found");
    if (tx.amountPence >= 0) {
      throw new ExpenseLinkError("Only outgoing payments can be linked to an expense");
    }
    const locked = periodLockError(await getBooksLockedThrough(companyId, db), tx.bookedAt);
    if (locked) throw new ExpenseLinkError(locked);

    const [expense] = await db
      .select()
      .from(expenses)
      .where(and(eq(expenses.id, expenseId), eq(expenses.companyId, companyId)))
      .for("update")
      .limit(1);
    if (!expense) throw new ExpenseLinkError("Expense not found");
    if (!isExpenseLinkable(expense)) {
      throw new ExpenseLinkError(
        expense.status === "pending"
          ? "Approve this expense before linking it to a bank transaction"
          : expense.status === "reimbursable" || expense.status === "reimbursed"
            ? "This expense was paid personally; link the reimbursement run's payment instead"
            : expense.mileageMiles != null
              ? "Mileage claims aren't paid from the bank, so they can't be linked"
              : "This expense can't be linked to a bank transaction",
      );
    }

    const confirmed = await db
      .select({
        bankTransactionId: reconciliationMatches.bankTransactionId,
        expenseId: reconciliationMatches.expenseId,
      })
      .from(reconciliationMatches)
      .where(
        and(
          eq(reconciliationMatches.confirmed, true),
          or(
            eq(reconciliationMatches.bankTransactionId, bankTransactionId),
            eq(reconciliationMatches.expenseId, expenseId),
          ),
        ),
      );
    if (confirmed.some((m) => m.bankTransactionId === bankTransactionId)) {
      throw new ExpenseLinkError("This transaction is already reconciled");
    }
    if (confirmed.some((m) => m.expenseId === expenseId)) {
      throw new ExpenseLinkError("This expense is already linked to a bank transaction");
    }

    await db
      .delete(reconciliationMatches)
      .where(
        and(
          eq(reconciliationMatches.confirmed, false),
          or(
            eq(reconciliationMatches.bankTransactionId, bankTransactionId),
            eq(reconciliationMatches.expenseId, expenseId),
          ),
        ),
      );

    const [created] = await db
      .insert(reconciliationMatches)
      .values({
        bankTransactionId,
        matchType: "expense",
        expenseId,
        confirmed: true,
        note: manualLinkNote(expense, tx.amountPence),
      })
      .returning({ id: reconciliationMatches.id });

    await db
      .update(expenses)
      .set({ status: "company_paid", paidByUserId: null })
      .where(and(eq(expenses.id, expenseId), eq(expenses.companyId, companyId)));

    return { matchId: created.id };
  });
}

/** Records an amount difference so a reviewer can see why they didn't auto-match. */
export function manualLinkNote(
  expense: { amountPence: number; detectedCurrency: string | null },
  bankAmountPence: number,
): string | null {
  const delta = linkAmountDelta(expense, bankAmountPence);
  if (!delta) return null;
  return `Linked by hand. Expense ${formatGBP(expense.amountPence)}, bank ${formatGBP(Math.abs(bankAmountPence))}.`;
}

/**
 * Undo a confirmed expense match, whether linked by hand or accepted from a
 * suggestion. The expense keeps its "company paid" status: unlinking says the
 * pairing was wrong, not that the company didn't pay.
 */
export async function unlinkExpenseMatch(
  companyId: string,
  target: { matchId: string } | { expenseId: string },
): Promise<{ matchId: string; bankTransactionId: string; expenseId: string | null }> {
  return getDb().transaction(async (db) => {
    const [row] = await db
      .select({ match: reconciliationMatches, bookedAt: bankTransactions.bookedAt })
      .from(reconciliationMatches)
      .innerJoin(bankTransactions, eq(reconciliationMatches.bankTransactionId, bankTransactions.id))
      .innerJoin(bankAccounts, eq(bankTransactions.bankAccountId, bankAccounts.id))
      .where(
        and(
          eq(bankAccounts.companyId, companyId),
          eq(reconciliationMatches.matchType, "expense"),
          eq(reconciliationMatches.confirmed, true),
          "matchId" in target
            ? eq(reconciliationMatches.id, target.matchId)
            : eq(reconciliationMatches.expenseId, target.expenseId),
        ),
      )
      .for("update", { of: reconciliationMatches })
      .limit(1);
    if (!row) throw new ExpenseLinkError("Linked expense not found");

    const locked = periodLockError(await getBooksLockedThrough(companyId, db), row.bookedAt);
    if (locked) throw new ExpenseLinkError(locked);

    await db.delete(reconciliationMatches).where(eq(reconciliationMatches.id, row.match.id));
    return {
      matchId: row.match.id,
      bankTransactionId: row.match.bankTransactionId,
      expenseId: row.match.expenseId,
    };
  });
}
