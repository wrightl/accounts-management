"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { mutate } from "@/lib/mutate";
import { todayIsoDate } from "@/lib/dates";
import { getBooksLockedThrough } from "@/lib/period-lock-queries";
import { FORM_FIELD_ERROR_SUMMARY } from "@/lib/validation/field-errors";
import type { ActionResult } from "@/actions/result";

const lockDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");

/**
 * Set ("lock up to and including this date") or clear (blank) the books lock.
 * Moving the date back reopens that part of the period. Every change is audited.
 */
export async function setBooksLock(formData: FormData): Promise<ActionResult> {
  const raw = String(formData.get("lockedThrough") ?? "").trim();
  let lockedThrough: string | null = null;
  if (raw) {
    const parsed = lockDateSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: FORM_FIELD_ERROR_SUMMARY,
        fieldErrors: { lockedThrough: "Enter a valid date" },
      };
    }
    if (parsed.data >= todayIsoDate()) {
      return {
        ok: false,
        error: FORM_FIELD_ERROR_SUMMARY,
        fieldErrors: { lockedThrough: "Choose a date before today" },
      };
    }
    lockedThrough = parsed.data;
  }

  return mutate(
    "books:lock",
    async ({ companyId, localUserId }) => {
      const previous = await getBooksLockedThrough(companyId);
      if (previous === lockedThrough) return { ok: true, id: companyId };

      const db = getDb();
      await db
        .update(companies)
        .set({ booksLockedThrough: lockedThrough, updatedAt: new Date() })
        .where(eq(companies.id, companyId));

      await writeAudit({
        companyId,
        actorUserId: localUserId,
        action: lockedThrough ? "books.lock" : "books.unlock",
        entityType: "company",
        entityId: companyId,
        meta: { from: previous, to: lockedThrough },
      });
      return { ok: true, id: companyId };
    },
    { paths: ["/reports", "/dashboard"] },
  );
}
