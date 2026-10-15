"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies } from "@/db/schema";
import { mutate } from "@/lib/mutate";
import { deadlineRefError, setDeadlineDone } from "@/lib/deadlines/filings";
import { FORM_FIELD_ERROR_SUMMARY } from "@/lib/validation/field-errors";
import type { ActionResult } from "@/actions/result";

/** Record that a deadline has been filed or paid. */
export async function markDeadlineDone(kind: string, dueDate: string): Promise<ActionResult> {
  const invalid = deadlineRefError(kind, dueDate);
  if (invalid) return { ok: false, error: invalid };

  return mutate(
    "accounts:write",
    (ctx) => setDeadlineDone(ctx, kind, dueDate, true),
    {
      audit: { action: "deadline.done", entityType: "deadline", meta: { kind, dueDate } },
      paths: ["/deadlines", "/dashboard"],
    },
  );
}

/** Put a deadline back on the to-do list. */
export async function undoDeadlineDone(kind: string, dueDate: string): Promise<ActionResult> {
  const invalid = deadlineRefError(kind, dueDate);
  if (invalid) return { ok: false, error: invalid };

  return mutate(
    "accounts:write",
    (ctx) => setDeadlineDone(ctx, kind, dueDate, false),
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
