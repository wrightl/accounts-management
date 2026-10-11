import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { and, desc, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { bankAccounts, bankTransactions } from "@/db/schema";
import { BULK_MODEL, aiGatewayConfigured } from "@/lib/ai/models";
import { BANK_SPENDING_CATEGORIES, formatBankCategory } from "@/lib/bank/categories";
import { listBankSpendingCategoryNames } from "@/lib/bank/spending-categories";
import { learnCategories, suggestFromHistory } from "@/lib/bookkeeper/learn";
import { formatGBP } from "@/lib/money";

/** Rows sent to the model in one run. */
const AI_BATCH = 60;

async function companyAccountIds(companyId: string) {
  return getDb()
    .select({ id: bankAccounts.id })
    .from(bankAccounts)
    .where(eq(bankAccounts.companyId, companyId));
}

/** Uncategorised money out with no suggestion yet and none dismissed. */
async function rowsNeedingSuggestions(accountIds: string[]) {
  if (accountIds.length === 0) return [];
  return getDb()
    .select({
      id: bankTransactions.id,
      counterparty: bankTransactions.counterparty,
      reference: bankTransactions.reference,
      description: bankTransactions.description,
      amountPence: bankTransactions.amountPence,
      bookedAt: bankTransactions.bookedAt,
    })
    .from(bankTransactions)
    .where(
      and(
        inArray(bankTransactions.bankAccountId, accountIds),
        lt(bankTransactions.amountPence, 0),
        isNull(bankTransactions.spendingCategory),
        isNull(bankTransactions.suggestedCategory),
        eq(bankTransactions.categorySuggestionDismissed, false),
      ),
    )
    .orderBy(desc(bankTransactions.bookedAt));
}

async function categorisedHistory(accountIds: string[]) {
  if (accountIds.length === 0) return [];
  return getDb()
    .select({
      counterparty: bankTransactions.counterparty,
      spendingCategory: bankTransactions.spendingCategory,
    })
    .from(bankTransactions)
    .where(
      and(
        inArray(bankTransactions.bankAccountId, accountIds),
        isNotNull(bankTransactions.spendingCategory),
        lt(bankTransactions.amountPence, 0),
      ),
    );
}

const aiSchema = z.object({
  suggestions: z.array(
    z.object({
      id: z.string(),
      category: z.string().nullable(),
      reason: z.string(),
    }),
  ),
});

/**
 * Ask the model to categorise rows that history can't, using the company's
 * own earlier choices as examples.
 */
async function suggestWithAi(
  rows: Awaited<ReturnType<typeof rowsNeedingSuggestions>>,
  categories: string[],
  examples: Array<{ payee: string; category: string }>,
): Promise<Array<{ id: string; category: string; reason: string }>> {
  const allowed = new Set(categories);
  const { output } = await generateText({
    model: BULK_MODEL,
    output: Output.object({ schema: aiSchema }),
    instructions: `You categorise business bank payments for a UK small company's bookkeeping.
Choose one category per payment from the allowed list, using the exact value given. Use null when you can't tell.
Give a reason of at most 15 words in plain English, e.g. "Adobe sells design software subscriptions."
Follow the company's own earlier choices for similar payees.`,
    prompt: JSON.stringify({
      allowedCategories: categories.map((value) => ({ value, label: formatBankCategory(value) })),
      earlierChoices: examples,
      payments: rows.map((r) => ({
        id: r.id,
        payee: r.counterparty,
        reference: r.reference,
        description: r.description,
        amount: formatGBP(-r.amountPence),
        date: r.bookedAt,
      })),
    }),
  });
  const ids = new Set(rows.map((r) => r.id));
  return (output?.suggestions ?? []).flatMap((s) =>
    s.category && allowed.has(s.category) && ids.has(s.id)
      ? [{ id: s.id, category: s.category, reason: s.reason.trim().slice(0, 200) }]
      : [],
  );
}

/**
 * Suggest categories for uncategorised payments. History comes first: a
 * payee you've categorised the same way before gets that category. The rest
 * go to the AI model when it's configured. Nothing is changed until someone
 * accepts a suggestion.
 */
export async function suggestBankCategories(companyId: string): Promise<{
  fromHistory: number;
  fromAi: number;
  aiUnavailable: boolean;
}> {
  const accountIds = (await companyAccountIds(companyId)).map((a) => a.id);
  const [rows, history, custom] = await Promise.all([
    rowsNeedingSuggestions(accountIds),
    categorisedHistory(accountIds),
    listBankSpendingCategoryNames(companyId),
  ]);
  if (rows.length === 0) return { fromHistory: 0, fromAi: 0, aiUnavailable: false };

  const learned = learnCategories(history);
  const db = getDb();
  const leftover: typeof rows = [];
  let fromHistory = 0;
  for (const row of rows) {
    const hit = suggestFromHistory(row.counterparty, learned);
    if (!hit) {
      leftover.push(row);
      continue;
    }
    await db
      .update(bankTransactions)
      .set({
        suggestedCategory: hit.category,
        suggestedCategoryReason: hit.reason,
        suggestedCategorySource: "history",
      })
      .where(eq(bankTransactions.id, row.id));
    fromHistory++;
  }

  if (leftover.length === 0) return { fromHistory, fromAi: 0, aiUnavailable: false };
  if (!aiGatewayConfigured()) return { fromHistory, fromAi: 0, aiUnavailable: true };

  const examples = [...learned.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 40)
    .map(([payee, l]) => ({ payee, category: l.category }));
  const categories = [...new Set([...BANK_SPENDING_CATEGORIES, ...custom])];
  const suggestions = await suggestWithAi(leftover.slice(0, AI_BATCH), categories, examples);
  for (const s of suggestions) {
    await db
      .update(bankTransactions)
      .set({
        suggestedCategory: s.category,
        suggestedCategoryReason: s.reason,
        suggestedCategorySource: "ai",
      })
      .where(and(eq(bankTransactions.id, s.id), isNull(bankTransactions.spendingCategory)));
  }
  return { fromHistory, fromAi: suggestions.length, aiUnavailable: false };
}

export async function listCategorySuggestions(companyId: string, limit = 200) {
  return getDb()
    .select({
      id: bankTransactions.id,
      bookedAt: bankTransactions.bookedAt,
      counterparty: bankTransactions.counterparty,
      reference: bankTransactions.reference,
      amountPence: bankTransactions.amountPence,
      category: bankTransactions.suggestedCategory,
      reason: bankTransactions.suggestedCategoryReason,
      source: bankTransactions.suggestedCategorySource,
    })
    .from(bankTransactions)
    .innerJoin(bankAccounts, eq(bankTransactions.bankAccountId, bankAccounts.id))
    .where(
      and(
        eq(bankAccounts.companyId, companyId),
        isNotNull(bankTransactions.suggestedCategory),
        isNull(bankTransactions.spendingCategory),
      ),
    )
    .orderBy(desc(bankTransactions.bookedAt))
    .limit(limit);
}

export async function countUncategorisedOutgoing(companyId: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(bankTransactions)
    .innerJoin(bankAccounts, eq(bankTransactions.bankAccountId, bankAccounts.id))
    .where(
      and(
        eq(bankAccounts.companyId, companyId),
        lt(bankTransactions.amountPence, 0),
        isNull(bankTransactions.spendingCategory),
      ),
    );
  return row?.n ?? 0;
}
