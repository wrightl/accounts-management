"use server";

import { getDb } from "@/db";
import { weeklyCloses } from "@/db/schema";
import { mutate } from "@/lib/mutate";
import { checklistSnapshot, getWeeklyCloseChecklist } from "@/lib/close/checklist";
import type { ActionResult } from "@/actions/result";

/**
 * Sign off the week. Items still open are recorded with the close, so the
 * accountant can see what was left.
 */
export async function closeWeek(): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    async ({ companyId, localUserId }) => {
      const checklist = await getWeeklyCloseChecklist(companyId);
      const snapshot = checklistSnapshot(checklist);
      const [row] = await getDb()
        .insert(weeklyCloses)
        .values({
          companyId,
          closedByUserId: localUserId,
          bankReconciledThrough: checklist.bankReconciledThrough,
          snapshot,
        })
        .returning({ id: weeklyCloses.id });
      return { ok: true, id: row.id };
    },
    {
      audit: { action: "close.week", entityType: "weekly_close" },
      paths: ["/close", "/reports", "/dashboard"],
    },
  );
}
