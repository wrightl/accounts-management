import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { bankAccounts, bankTransactions, expenses, reconciliationMatches } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { ReconciliationError, confirmMatch, updateTransactionCategory } from "@/lib/bank/queries";
import { suggestBankCategories } from "@/lib/bookkeeper/categories";
import { suggestReceiptMatches } from "@/lib/bookkeeper/receipts";
import { checkPeriodOpen } from "@/lib/period-lock-queries";
import type { ActionResult } from "@/actions/result";

/**
 * AI bookkeeper review steps shared by the web actions and the mobile API, so
 * both apply the same rules. Callers handle authz; audit entries noted below.
 */
export type BookkeeperContext = { companyId: string; localUserId: string };

export type SuggestionRun = {
  ok: true;
  categories: { fromHistory: number; fromAi: number };
  receipts: number;
  aiUnavailable: boolean;
};

/** Look for new category and receipt suggestions. Writes the audit entry. */
export async function findBookkeeperSuggestions(ctx: BookkeeperContext): Promise<SuggestionRun> {
  const { companyId, localUserId } = ctx;
  const categories = await suggestBankCategories(companyId);
  const receipts = await suggestReceiptMatches(companyId);
  await writeAudit({
    companyId,
    actorUserId: localUserId,
    action: "ai.suggest",
    meta: { ...categories, receipts: receipts.suggested },
  });
  return {
    ok: true,
    categories: { fromHistory: categories.fromHistory, fromAi: categories.fromAi },
    receipts: receipts.suggested,
    aiUnavailable: categories.aiUnavailable || receipts.aiUnavailable,
  };
}

/** Rows of this company with a pending suggestion, from the given ids. */
async function ownSuggestedRows(companyId: string, ids: string[]) {
  if (ids.length === 0) return [];
  return getDb()
    .select({ id: bankTransactions.id, category: bankTransactions.suggestedCategory })
    .from(bankTransactions)
    .innerJoin(bankAccounts, eq(bankTransactions.bankAccountId, bankAccounts.id))
    .where(
      and(
        eq(bankAccounts.companyId, companyId),
        inArray(bankTransactions.id, ids.slice(0, 500)),
        isNull(bankTransactions.spendingCategory),
      ),
    );
}

/** Each suggestion becomes the row's category (and teaches future ones). Writes the audit entry. */
export async function acceptCategorySuggestionsFor(
  ctx: BookkeeperContext,
  ids: string[],
): Promise<ActionResult> {
  const { companyId, localUserId } = ctx;
  const rows = await ownSuggestedRows(companyId, ids);
  for (const row of rows) {
    if (row.category) await updateTransactionCategory(companyId, row.id, row.category);
  }
  await writeAudit({
    companyId,
    actorUserId: localUserId,
    action: "ai.accept_categories",
    entityType: "bank_transaction",
    meta: { count: rows.length },
  });
  return { ok: true };
}

/** Dismiss suggestions; those rows won't be suggested again. */
export async function dismissCategorySuggestionsFor(
  companyId: string,
  ids: string[],
): Promise<ActionResult> {
  const rows = await ownSuggestedRows(companyId, ids);
  if (rows.length === 0) return { ok: true };
  await getDb()
    .update(bankTransactions)
    .set({
      suggestedCategory: null,
      suggestedCategoryReason: null,
      suggestedCategorySource: null,
      categorySuggestionDismissed: true,
    })
    .where(inArray(bankTransactions.id, rows.map((r) => r.id)));
  return { ok: true };
}

/**
 * Accept an AI receipt match. With `useBankAmount`, the expense takes the
 * amount the bank actually charged (VAT is recalculated at its rate).
 */
export async function acceptReceiptMatchFor(
  companyId: string,
  matchId: string,
  useBankAmount: boolean,
): Promise<ActionResult> {
  const db = getDb();
  const [row] = await db
    .select({ match: reconciliationMatches, expense: expenses, bankAmount: bankTransactions.amountPence })
    .from(reconciliationMatches)
    .innerJoin(expenses, eq(reconciliationMatches.expenseId, expenses.id))
    .innerJoin(bankTransactions, eq(reconciliationMatches.bankTransactionId, bankTransactions.id))
    .where(and(eq(reconciliationMatches.id, matchId), eq(expenses.companyId, companyId)))
    .limit(1);
  if (!row) return { ok: false, error: "Match not found" };

  const bankPence = -row.bankAmount;
  if (useBankAmount && bankPence !== row.expense.amountPence) {
    const locked = await checkPeriodOpen(companyId, row.expense.spentAt);
    if (locked) return { ok: false, error: locked };
    const rate = row.expense.vatRate;
    await db
      .update(expenses)
      .set({
        amountPence: bankPence,
        vatPence: rate > 0 ? Math.round((bankPence * rate) / (100 + rate)) : 0,
      })
      .where(eq(expenses.id, row.expense.id));
  }
  try {
    await confirmMatch(companyId, matchId);
  } catch (e) {
    if (e instanceof ReconciliationError) return { ok: false, error: e.message };
    throw e;
  }
  return { ok: true, id: matchId };
}
