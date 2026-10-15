import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { FORM_FIELD_ERROR_SUMMARY } from "@/lib/validation/field-errors";

/** Refuse a payer who is not a member of this company. */
export async function checkPayerInCompany(
  companyId: string,
  paidByUserId: string | null,
): Promise<{ ok: true } | { ok: false; error: string; fieldErrors: Record<string, string> }> {
  if (!paidByUserId) return { ok: true };
  const [row] = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, paidByUserId), eq(users.companyId, companyId)))
    .limit(1);
  if (row) return { ok: true };
  return {
    ok: false,
    error: FORM_FIELD_ERROR_SUMMARY,
    fieldErrors: { paidByUserId: "Select who paid" },
  };
}
