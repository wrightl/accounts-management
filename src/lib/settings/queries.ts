import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies, type Company } from "@/db/schema";
import { getCompany } from "@/lib/tenant";

/**
 * Load company settings for a tenant. Does not auto-create — missing company
 * is an error (onboarding creates the row).
 */
export async function getCompanySettings(companyId: string): Promise<Company> {
  return getCompany(companyId);
}

/**
 * @deprecated Prefer {@link getCompanySettings}. Kept for call-site migration.
 */
export async function getOrCreateCompanySettings(companyId?: string) {
  if (!companyId) {
    throw new Error("getOrCreateCompanySettings requires companyId");
  }
  return getCompanySettings(companyId);
}

export async function updateCompanySettings(
  companyId: string,
  patch: Partial<typeof companies.$inferInsert>,
): Promise<Company> {
  const db = getDb();
  const [updated] = await db
    .update(companies)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(companies.id, companyId))
    .returning();
  if (!updated) {
    throw new Error(`Company not found: ${companyId}`);
  }
  return updated;
}
