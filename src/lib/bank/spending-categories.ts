import "server-only";
import { and, count, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { bankAccounts, bankSpendingCategories, bankTransactions } from "@/db/schema";
import { isKnownBankCategory } from "@/lib/bank/categories";

const MAX_CATEGORY_LENGTH = 120;

export type BankSpendingCategoryRow = {
  id: string;
  name: string;
  usageCount: number;
};

/** Trim and cap length; null when empty. */
export function normalizeSpendingCategoryName(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_CATEGORY_LENGTH);
}

/**
 * Ensure a custom label exists in the catalog and return its canonical spelling.
 * Built-in Starling categories are returned unchanged and not stored in the catalog.
 */
export async function upsertBankSpendingCategory(
  companyId: string,
  value: string | null | undefined,
): Promise<string | null> {
  const normalized = normalizeSpendingCategoryName(value);
  if (!normalized) return null;
  if (isKnownBankCategory(normalized)) return normalized;

  const db = getDb();
  const [existing] = await db
    .select({ name: bankSpendingCategories.name })
    .from(bankSpendingCategories)
    .where(
      and(
        eq(bankSpendingCategories.companyId, companyId),
        sql`lower(${bankSpendingCategories.name}) = ${normalized.toLowerCase()}`,
      ),
    )
    .limit(1);

  if (existing) return existing.name;

  try {
    const [created] = await db
      .insert(bankSpendingCategories)
      .values({ companyId, name: normalized })
      .returning({ name: bankSpendingCategories.name });
    return created.name;
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const [race] = await db
      .select({ name: bankSpendingCategories.name })
      .from(bankSpendingCategories)
      .where(
        and(
          eq(bankSpendingCategories.companyId, companyId),
          sql`lower(${bankSpendingCategories.name}) = ${normalized.toLowerCase()}`,
        ),
      )
      .limit(1);
    return race?.name ?? normalized;
  }
}

export async function listBankSpendingCategoriesWithUsage(
  companyId: string,
): Promise<BankSpendingCategoryRow[]> {
  const db = getDb();
  return db
    .select({
      id: bankSpendingCategories.id,
      name: bankSpendingCategories.name,
      usageCount: count(bankTransactions.id),
    })
    .from(bankSpendingCategories)
    .leftJoin(
      bankTransactions,
      sql`lower(${bankTransactions.spendingCategory}) = lower(${bankSpendingCategories.name})`,
    )
    .leftJoin(bankAccounts, eq(bankTransactions.bankAccountId, bankAccounts.id))
    .where(eq(bankSpendingCategories.companyId, companyId))
    .groupBy(bankSpendingCategories.id, bankSpendingCategories.name)
    .orderBy(bankSpendingCategories.name);
}

export async function listBankSpendingCategoryNames(
  companyId: string,
): Promise<string[]> {
  const rows = await listBankSpendingCategoriesWithUsage(companyId);
  return rows.map((row) => row.name);
}

export async function deleteUnusedBankSpendingCategory(
  companyId: string,
  categoryId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getDb();
  const [category] = await db
    .select({ id: bankSpendingCategories.id, name: bankSpendingCategories.name })
    .from(bankSpendingCategories)
    .where(
      and(
        eq(bankSpendingCategories.id, categoryId),
        eq(bankSpendingCategories.companyId, companyId),
      ),
    )
    .limit(1);

  if (!category) return { ok: false, error: "Category not found" };

  const [usage] = await db
    .select({ total: count() })
    .from(bankTransactions)
    .innerJoin(bankAccounts, eq(bankTransactions.bankAccountId, bankAccounts.id))
    .where(
      and(
        eq(bankAccounts.companyId, companyId),
        sql`lower(${bankTransactions.spendingCategory}) = ${category.name.toLowerCase()}`,
      ),
    );

  if ((usage?.total ?? 0) > 0) {
    return { ok: false, error: "Category is still in use on bank transactions" };
  }

  await db
    .delete(bankSpendingCategories)
    .where(
      and(
        eq(bankSpendingCategories.id, categoryId),
        eq(bankSpendingCategories.companyId, companyId),
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
