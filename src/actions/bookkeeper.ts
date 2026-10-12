"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { bankAccounts, bankTransactions, expenses, reconciliationMatches } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { requireActionPermission } from "@/lib/auth";
import { mutate, mutateWide } from "@/lib/mutate";
import { aiGatewayConfigured } from "@/lib/ai/models";
import { ReconciliationError, confirmMatch, updateTransactionCategory } from "@/lib/bank/queries";
import {
  DAILY_QUESTION_LIMIT,
  QUESTION_MAX_LENGTH,
  answerQuestion,
  questionsAskedToday,
  type AnswerResult,
} from "@/lib/bookkeeper/ask";
import { suggestBankCategories } from "@/lib/bookkeeper/categories";
import { suggestReceiptMatches } from "@/lib/bookkeeper/receipts";
import { checkPeriodOpen } from "@/lib/period-lock-queries";
import type { ActionResult } from "@/actions/result";

const PATHS = ["/bookkeeper", "/transactions", "/spending"];

export async function runBookkeeperSuggestions(): Promise<
  ActionResult & {
    categories?: { fromHistory: number; fromAi: number };
    receipts?: number;
    aiUnavailable?: boolean;
  }
> {
  return mutateWide(
    "accounts:write",
    async ({ companyId, localUserId }) => {
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
    },
    { paths: PATHS },
  );
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

/** Accept category suggestions: each becomes the row's category (and teaches future ones). */
export async function acceptCategorySuggestions(ids: string[]): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    async ({ companyId, localUserId }) => {
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
    },
    { paths: PATHS },
  );
}

/** Dismiss suggestions; those rows won't be suggested again. */
export async function dismissCategorySuggestions(ids: string[]): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    async ({ companyId }) => {
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
    },
    { paths: PATHS },
  );
}

/**
 * Accept an AI receipt match. With `useBankAmount`, the expense takes the
 * amount the bank actually charged (VAT is recalculated at its rate).
 */
export async function acceptReceiptMatch(
  matchId: string,
  useBankAmount: boolean,
): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    async ({ companyId }) => {
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
    },
    {
      audit: {
        action: "ai.accept_receipt_match",
        entityType: "reconciliation_match",
        meta: { useBankAmount },
      },
      paths: [...PATHS, "/expenses"],
    },
  );
}

/** Answer a question about the books. Read-only; limited per company per day. */
export async function askBookkeeper(question: string): Promise<AnswerResult> {
  const authz = await requireActionPermission("reports:read");
  if (!authz.ok) return authz;
  const companyId = authz.user.companyId;
  if (!companyId) return { ok: false, error: "Complete onboarding first." };
  const trimmed = question.trim();
  if (trimmed.length < 3) return { ok: false, error: "Type a question first." };
  if (trimmed.length > QUESTION_MAX_LENGTH) {
    return { ok: false, error: `Keep questions under ${QUESTION_MAX_LENGTH} characters.` };
  }
  if (!aiGatewayConfigured()) {
    return { ok: false, error: "AI isn't set up on this deployment yet." };
  }
  if ((await questionsAskedToday(companyId)) >= DAILY_QUESTION_LIMIT) {
    return {
      ok: false,
      error: `Your company has asked ${DAILY_QUESTION_LIMIT} questions today. Try again tomorrow.`,
    };
  }

  let result: AnswerResult;
  // Only `ai.ask` counts towards the daily limit, so a failed call to the model
  // doesn't use up one of the company's questions.
  let action = "ai.ask";
  try {
    result = await answerQuestion(companyId, trimmed);
  } catch (e) {
    console.error("[bookkeeper] answer failed", e);
    action = "ai.ask_failed";
    result = { ok: false, error: "Couldn't answer that just now. Try again in a moment." };
  }
  await writeAudit({
    companyId,
    actorUserId: authz.user.localUserId ?? null,
    action,
    meta: { question: trimmed, ok: result.ok, sources: result.ok ? result.sources : [] },
  });
  return result;
}
