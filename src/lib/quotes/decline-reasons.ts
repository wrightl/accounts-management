import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { quoteDeclineReasonCategories } from "@/db/schema";

export const DEFAULT_DECLINE_REASONS = [
  "Price",
  "Timing",
  "Scope",
  "Competitor",
  "Budget",
  "Other",
] as const;

const MAX_CATEGORY_LENGTH = 120;

export function normalizeDeclineCategoryName(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_CATEGORY_LENGTH);
}

export async function ensureDefaultDeclineReasonCategories(companyId: string) {
  const db = getDb();
  for (const name of DEFAULT_DECLINE_REASONS) {
    try {
      await db.insert(quoteDeclineReasonCategories).values({ companyId, name });
    } catch {
      // Already exists.
    }
  }
}

export async function listDeclineReasonCategories(
  companyId: string,
): Promise<string[]> {
  await ensureDefaultDeclineReasonCategories(companyId);
  const db = getDb();
  const rows = await db
    .select({ name: quoteDeclineReasonCategories.name })
    .from(quoteDeclineReasonCategories)
    .where(eq(quoteDeclineReasonCategories.companyId, companyId))
    .orderBy(quoteDeclineReasonCategories.name);
  return rows.map((r) => r.name);
}

export async function upsertDeclineReasonCategory(
  companyId: string,
  value: string | null | undefined,
): Promise<string | null> {
  const normalized = normalizeDeclineCategoryName(value);
  if (!normalized) return null;

  const db = getDb();
  const [existing] = await db
    .select({ name: quoteDeclineReasonCategories.name })
    .from(quoteDeclineReasonCategories)
    .where(
      and(
        eq(quoteDeclineReasonCategories.companyId, companyId),
        sql`lower(${quoteDeclineReasonCategories.name}) = ${normalized.toLowerCase()}`,
      ),
    )
    .limit(1);

  if (existing) return existing.name;

  try {
    const [created] = await db
      .insert(quoteDeclineReasonCategories)
      .values({ companyId, name: normalized })
      .returning({ name: quoteDeclineReasonCategories.name });
    return created.name;
  } catch {
    const [race] = await db
      .select({ name: quoteDeclineReasonCategories.name })
      .from(quoteDeclineReasonCategories)
      .where(
        and(
          eq(quoteDeclineReasonCategories.companyId, companyId),
          sql`lower(${quoteDeclineReasonCategories.name}) = ${normalized.toLowerCase()}`,
        ),
      )
      .limit(1);
    return race?.name ?? normalized;
  }
}
