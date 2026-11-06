import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { reconciliationMatches, reimbursements } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import {
  getBankTransactionById,
  isBankTransactionAvailable,
  ReconciliationError,
} from "@/lib/bank/queries";
import { todayIsoDate } from "@/lib/dates";
import { checkPeriodOpen } from "@/lib/period-lock-queries";
import { payReimbursementRun, ReimbursementPayError } from "@/lib/reimbursements/pay";
import { parseMarkPaidInput } from "@/lib/reimbursements/schema";
import type { ActionResult } from "@/actions/result";

/**
 * Mark a reimbursement run paid, optionally matched to the outgoing bank
 * payment, whose date then wins. The web action and the mobile route both
 * call this inside their auth checks.
 */
export async function markReimbursementRunPaid(
  ctx: { companyId: string; localUserId: string },
  id: string,
  raw: { bankTransactionId?: unknown },
): Promise<ActionResult> {
  const { companyId, localUserId } = ctx;
  const parsed = parseMarkPaidInput({ bankTransactionId: raw.bankTransactionId ?? "" });
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, fieldErrors: parsed.fieldErrors };
  }

  const bankTransactionId = parsed.data.bankTransactionId;
  const db = getDb();
  const [run] = await db
    .select()
    .from(reimbursements)
    .where(and(eq(reimbursements.id, id), eq(reimbursements.companyId, companyId)))
    .limit(1);
  if (!run) return { ok: false, error: "Reimbursement not found" };
  if (run.status === "paid") return { ok: false, error: "Already paid" };

  if (bankTransactionId) {
    const bankTx = await getBankTransactionById(companyId, bankTransactionId);
    if (!bankTx) return { ok: false, error: "Bank transaction not found" };
    if (bankTx.amountPence >= 0) {
      return { ok: false, error: "Only outgoing bank transactions can be linked" };
    }
    if (!(await isBankTransactionAvailable(bankTransactionId))) {
      return { ok: false, error: "Bank transaction is already reconciled" };
    }
    if (Math.abs(bankTx.amountPence) !== run.totalPence) {
      return { ok: false, error: "Amount must match the reimbursement total" };
    }
  }

  if (
    !bankTransactionId &&
    run.reimbursementDate &&
    run.reimbursementDate > todayIsoDate()
  ) {
    return {
      ok: false,
      error: "The reimbursement date is in the future. Edit the run to change it.",
    };
  }

  // A linked bank transaction's date wins: that's when the money actually left.
  const paidAt = bankTransactionId
    ? new Date(
        `${(await getBankTransactionById(companyId, bankTransactionId))!.bookedAt}T12:00:00Z`,
      )
    : run.reimbursementDate
      ? new Date(`${run.reimbursementDate}T12:00:00Z`)
      : new Date();
  const locked = await checkPeriodOpen(companyId, paidAt);
  if (locked) return { ok: false, error: locked };

  try {
    await db.transaction(async (tx) => {
      await payReimbursementRun(tx, companyId, id, paidAt);

      if (bankTransactionId) {
        const existing = await tx
          .select({ id: reconciliationMatches.id })
          .from(reconciliationMatches)
          .where(eq(reconciliationMatches.bankTransactionId, bankTransactionId))
          .limit(1);
        if (existing[0]) {
          throw new ReconciliationError("Bank transaction is already reconciled");
        }
        await tx.insert(reconciliationMatches).values({
          bankTransactionId,
          matchType: "reimbursement",
          reimbursementId: id,
          confirmed: true,
        });
      }
    });
  } catch (e) {
    if (e instanceof ReimbursementPayError || e instanceof ReconciliationError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  await writeAudit({
    companyId,
    actorUserId: localUserId,
    action: "reimbursement.pay",
    entityType: "reimbursement",
    entityId: id,
    meta: bankTransactionId ? { bankTransactionId } : undefined,
  });

  return { ok: true, id };
}
