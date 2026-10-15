import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { deadlineFilings } from "@/db/schema";
import { todayIsoDate } from "@/lib/dates";
import { isDeadlineKind } from "@/lib/deadlines/calc";
import type { ActionResult } from "@/actions/result";

/** Why a deadline reference is invalid, or null when it is fine. */
export function deadlineRefError(kind: string, dueDate: string): string | null {
  if (!isDeadlineKind(kind)) return "Unknown deadline";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return "Invalid due date";
  return null;
}

/**
 * Mark a deadline as filed or paid, or put it back on the to-do list.
 * Shared by the web actions and the mobile API; callers handle authz and audit.
 */
export async function setDeadlineDone(
  ctx: { companyId: string; localUserId: string },
  kind: string,
  dueDate: string,
  done: boolean,
): Promise<ActionResult> {
  const invalid = deadlineRefError(kind, dueDate);
  if (invalid) return { ok: false, error: invalid };
  const { companyId, localUserId } = ctx;
  const db = getDb();
  if (done) {
    await db
      .insert(deadlineFilings)
      .values({ companyId, kind, dueDate, filedOn: todayIsoDate(), filedByUserId: localUserId })
      .onConflictDoNothing();
  } else {
    await db
      .delete(deadlineFilings)
      .where(
        and(
          eq(deadlineFilings.companyId, companyId),
          eq(deadlineFilings.kind, kind),
          eq(deadlineFilings.dueDate, dueDate),
        ),
      );
  }
  return { ok: true };
}
