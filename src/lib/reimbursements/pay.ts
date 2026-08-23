import { eq, inArray, sql } from "drizzle-orm";
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
  reimbursementId: string,
  paidAt: Date,
) {
  await tx.execute(
    sql`select id from reimbursements where id = ${reimbursementId} for update`,
  );

  const [run] = await tx
    .select()
    .from(reimbursements)
    .where(eq(reimbursements.id, reimbursementId))
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
    .where(eq(reimbursements.id, reimbursementId));

  if (items.length > 0) {
    await tx
      .update(expenses)
      .set({ status: "reimbursed" })
      .where(
        inArray(
          expenses.id,
          items.map((i) => i.expenseId),
        ),
      );
  }
}
