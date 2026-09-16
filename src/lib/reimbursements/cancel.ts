import { and, eq, inArray } from "drizzle-orm";
import {
  reconciliationMatches,
  reimbursements,
} from "@/db/schema";
import type { getDb } from "@/db";

type DbTx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/**
 * Delete pending reimbursement runs for a payee in a company.
 * Linked expenses stay reimbursable (they only flip on pay).
 * Returns the cancelled run IDs.
 */
export async function cancelPendingReimbursementRunsForPayee(
  tx: DbTx,
  companyId: string,
  payeeUserId: string,
): Promise<string[]> {
  const pending = await tx
    .select({ id: reimbursements.id })
    .from(reimbursements)
    .where(
      and(
        eq(reimbursements.companyId, companyId),
        eq(reimbursements.payeeUserId, payeeUserId),
        eq(reimbursements.status, "pending"),
      ),
    );

  if (pending.length === 0) return [];

  const ids = pending.map((r) => r.id);

  await tx
    .delete(reconciliationMatches)
    .where(inArray(reconciliationMatches.reimbursementId, ids));

  await tx.delete(reimbursements).where(inArray(reimbursements.id, ids));

  return ids;
}
