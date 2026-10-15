import "server-only";
import { getDb } from "@/db";
import { weeklyCloses } from "@/db/schema";
import { checklistSnapshot, getWeeklyCloseChecklist } from "@/lib/close/checklist";
import type { ActionResult } from "@/actions/result";

/**
 * Sign off the week. Items still open are recorded with the close, so the
 * accountant can see what was left. Shared by the web action and the mobile
 * API; callers handle authz and audit.
 */
export async function recordWeeklyClose(ctx: {
  companyId: string;
  localUserId: string;
}): Promise<ActionResult> {
  const checklist = await getWeeklyCloseChecklist(ctx.companyId);
  const [row] = await getDb()
    .insert(weeklyCloses)
    .values({
      companyId: ctx.companyId,
      closedByUserId: ctx.localUserId,
      bankReconciledThrough: checklist.bankReconciledThrough,
      snapshot: checklistSnapshot(checklist),
    })
    .returning({ id: weeklyCloses.id });
  return { ok: true, id: row.id };
}
