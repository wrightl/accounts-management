"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies } from "@/db/schema";
import { mutate } from "@/lib/mutate";
import { FORM_FIELD_ERROR_SUMMARY } from "@/lib/validation/field-errors";
import type { ActionResult } from "@/actions/result";

/** The assumptions behind "safe to pay yourself": VAT quarters and the cash buffer. */
export async function saveSafeToPaySettings(formData: FormData): Promise<ActionResult> {
  const vatQuarterEndMonth = Number(formData.get("vatQuarterEndMonth"));
  const bufferMonths = Number(formData.get("bufferMonths"));
  const fieldErrors: Record<string, string> = {};
  if (![1, 2, 3].includes(vatQuarterEndMonth)) {
    fieldErrors.vatQuarterEndMonth = "Choose when your VAT quarters end";
  }
  if (!Number.isInteger(bufferMonths) || bufferMonths < 0 || bufferMonths > 6) {
    fieldErrors.bufferMonths = "Choose between 0 and 6 months";
  }
  if (Object.keys(fieldErrors).length) {
    return { ok: false, error: FORM_FIELD_ERROR_SUMMARY, fieldErrors };
  }

  return mutate(
    "settings:manage",
    async ({ companyId }) => {
      await getDb()
        .update(companies)
        .set({ vatQuarterEndMonth, safeToPayBufferMonths: bufferMonths, updatedAt: new Date() })
        .where(eq(companies.id, companyId));
      return { ok: true, id: companyId };
    },
    {
      audit: {
        action: "settings.safe_to_pay",
        entityType: "company",
        meta: { vatQuarterEndMonth, bufferMonths },
      },
      paths: ["/safe-to-pay", "/dashboard"],
    },
  );
}
