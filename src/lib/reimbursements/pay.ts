import { eq, inArray, sql, and } from "drizzle-orm";
import { expenses, reimbursementItems, reimbursements } from "@/db/schema";
import type { getDb } from "@/db";

type DbTx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

export class ReimbursementPayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReimbursementPayError";
  }
}

/** Mark a pending reimbursement run paid and flip linked expenses to reimbursed. */
export async function payReimbursementRun(
  tx: DbTx,
  companyId: string,
  reimbursementId: string,
  paidAt: Date,
) {
  await tx.execute(
    sql`select id from reimbursements where id = ${reimbursementId} for update`,
  );

  const [run] = await tx
    .select()
    .from(reimbursements)
    .where(
      and(
        eq(reimbursements.id, reimbursementId),
        eq(reimbursements.companyId, companyId),
      ),
    )
    .limit(1);
  if (!run) throw new ReimbursementPayError("Reimbursement not found");
  if (run.status === "paid") throw new ReimbursementPayError("Already paid");

  const items = await tx
    .select()
    .from(reimbursementItems)
    .where(eq(reimbursementItems.reimbursementId, reimbursementId));

  await tx
    .update(reimbursements)
    .set({ status: "paid", paidAt })
    .where(
      and(
        eq(reimbursements.id, reimbursementId),
        eq(reimbursements.companyId, companyId),
      ),
    );

  if (items.length > 0) {
    await tx
      .update(expenses)
      .set({ status: "reimbursed" })
      .where(
        and(
          inArray(
            expenses.id,
            items.map((i) => i.expenseId),
          ),
          eq(expenses.companyId, companyId),
        ),
      );
  }
}
