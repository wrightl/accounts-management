import "server-only";
import { and, count, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  bankAccounts,
  bankTransactions,
  incomeCategories,
  reconciliationMatches,
} from "@/db/schema";
import {
  BUILTIN_INCOME_CATEGORIES,
  isBuiltinIncomeCategoryName,
  normalizeIncomeCategoryName,
  type IncomeCategoryRow,
} from "@/lib/bank/income-categories";

export type { IncomeCategoryRow };

export async function listIncomeCategoriesWithUsage(
  companyId: string,
): Promise<IncomeCategoryRow[]> {
  const db = getDb();
  return db
    .select({
      id: incomeCategories.id,
      name: incomeCategories.name,
      usageCount: count(reconciliationMatches.id),
    })
    .from(incomeCategories)
    .leftJoin(
      reconciliationMatches,
      and(
        eq(reconciliationMatches.matchType, "other_income"),
        eq(reconciliationMatches.confirmed, true),
        sql`lower(${reconciliationMatches.incomeCategory}) = lower(${incomeCategories.name})`,
      ),
    )
    .where(eq(incomeCategories.companyId, companyId))
    .groupBy(incomeCategories.id, incomeCategories.name)
    .orderBy(incomeCategories.name);
}

export async function listIncomeCategoryNames(
  companyId: string,
): Promise<string[]> {
  const rows = await listIncomeCategoriesWithUsage(companyId);
  return rows.map((row) => row.name);
}

/**
 * Resolve a category label to its canonical spelling if it is a built-in
 * or an existing catalogued custom name for the company.
 */
export async function resolveIncomeCategory(
  companyId: string,
  value: string | null | undefined,
): Promise<string | null> {
  const normalized = normalizeIncomeCategoryName(value);
  if (!normalized) return null;

  if (isBuiltinIncomeCategoryName(normalized)) {
    const builtin = BUILTIN_INCOME_CATEGORIES.find(
      (c) => c.toLowerCase() === normalized.toLowerCase(),
    );
    return builtin ?? normalized;
  }

  const db = getDb();
  const [existing] = await db
    .select({ name: incomeCategories.name })
    .from(incomeCategories)
    .where(
      and(
        eq(incomeCategories.companyId, companyId),
        sql`lower(${incomeCategories.name}) = ${normalized.toLowerCase()}`,
      ),
    )
    .limit(1);

  return existing?.name ?? null;
}

export async function createIncomeCategory(
  companyId: string,
  value: string | null | undefined,
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const normalized = normalizeIncomeCategoryName(value);
  if (!normalized) return { ok: false, error: "Enter a category name" };
  if (isBuiltinIncomeCategoryName(normalized)) {
    return {
      ok: false,
      error: "That name matches a built-in category",
    };
  }

  const db = getDb();
  try {
    const [created] = await db
      .insert(incomeCategories)
      .values({ companyId, name: normalized })
      .returning({ name: incomeCategories.name });
    return { ok: true, name: created.name };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    return { ok: false, error: "A category with that name already exists" };
  }
}

export async function deleteUnusedIncomeCategory(
  companyId: string,
  categoryId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getDb();
  const [category] = await db
    .select({ id: incomeCategories.id, name: incomeCategories.name })
    .from(incomeCategories)
    .where(
      and(
        eq(incomeCategories.id, categoryId),
        eq(incomeCategories.companyId, companyId),
      ),
    )
    .limit(1);

  if (!category) return { ok: false, error: "Category not found" };

  const [usage] = await db
    .select({ total: count() })
    .from(reconciliationMatches)
    .innerJoin(
      bankTransactions,
      eq(reconciliationMatches.bankTransactionId, bankTransactions.id),
    )
    .innerJoin(
      bankAccounts,
      eq(bankTransactions.bankAccountId, bankAccounts.id),
    )
    .where(
      and(
        eq(bankAccounts.companyId, companyId),
        eq(reconciliationMatches.matchType, "other_income"),
        eq(reconciliationMatches.confirmed, true),
        sql`lower(${reconciliationMatches.incomeCategory}) = ${category.name.toLowerCase()}`,
      ),
    );

  if ((usage?.total ?? 0) > 0) {
    return {
      ok: false,
      error: "Category is still in use on other-income explanations",
    };
  }

  await db
    .delete(incomeCategories)
    .where(
      and(
        eq(incomeCategories.id, categoryId),
        eq(incomeCategories.companyId, companyId),
      ),
    );
  return { ok: true };
}

function isUniqueViolation(err: unknown): boolean {
  const code =
    typeof err === "object" && err !== null
      ? String(
          (err as { code?: string }).code ??
            (err as { cause?: { code?: string } }).cause?.code ??
            "",
        )
      : "";
  if (code === "23505") return true;
  const message = err instanceof Error ? err.message : String(err);
  return /duplicate key|unique constraint/i.test(message);
}
