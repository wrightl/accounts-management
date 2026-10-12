"use server";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies, deadlineFilings } from "@/db/schema";
import { mutate } from "@/lib/mutate";
import { todayIsoDate } from "@/lib/dates";
import { isDeadlineKind } from "@/lib/deadlines/calc";
import { FORM_FIELD_ERROR_SUMMARY } from "@/lib/validation/field-errors";
import type { ActionResult } from "@/actions/result";

function validate(kind: string, dueDate: string): string | null {
  if (!isDeadlineKind(kind)) return "Unknown deadline";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return "Invalid due date";
  return null;
}

/** Record that a deadline has been filed or paid. */
export async function markDeadlineDone(kind: string, dueDate: string): Promise<ActionResult> {
  const invalid = validate(kind, dueDate);
  if (invalid) return { ok: false, error: invalid };

  return mutate(
    "accounts:write",
    async ({ companyId, localUserId }) => {
      await getDb()
        .insert(deadlineFilings)
        .values({ companyId, kind, dueDate, filedOn: todayIsoDate(), filedByUserId: localUserId })
        .onConflictDoNothing();
      return { ok: true };
    },
    {
      audit: { action: "deadline.done", entityType: "deadline", meta: { kind, dueDate } },
      paths: ["/deadlines", "/dashboard"],
    },
  );
}

/** Put a deadline back on the to-do list. */
export async function undoDeadlineDone(kind: string, dueDate: string): Promise<ActionResult> {
  const invalid = validate(kind, dueDate);
  if (invalid) return { ok: false, error: invalid };

  return mutate(
    "accounts:write",
    async ({ companyId }) => {
      await getDb()
        .delete(deadlineFilings)
        .where(
          and(
            eq(deadlineFilings.companyId, companyId),
            eq(deadlineFilings.kind, kind),
            eq(deadlineFilings.dueDate, dueDate),
          ),
        );
      return { ok: true };
    },
    {
      audit: { action: "deadline.undo", entityType: "deadline", meta: { kind, dueDate } },
      paths: ["/deadlines", "/dashboard"],
    },
  );
}

/** Which months the VAT quarters end in (1, 2 or 3: the first quarter end of the year). */
export async function saveVatQuarterStagger(formData: FormData): Promise<ActionResult> {
  const vatQuarterEndMonth = Number(formData.get("vatQuarterEndMonth"));
  if (![1, 2, 3].includes(vatQuarterEndMonth)) {
    return {
      ok: false,
      error: FORM_FIELD_ERROR_SUMMARY,
      fieldErrors: { vatQuarterEndMonth: "Choose when your VAT quarters end" },
    };
  }
  return mutate(
    "settings:manage",
    async ({ companyId }) => {
      await getDb()
        .update(companies)
        .set({ vatQuarterEndMonth, updatedAt: new Date() })
        .where(eq(companies.id, companyId));
      return { ok: true, id: companyId };
    },
    {
      audit: { action: "settings.vat_quarters", entityType: "company", meta: { vatQuarterEndMonth } },
      paths: ["/deadlines", "/safe-to-pay", "/forecast"],
    },
  );
}
