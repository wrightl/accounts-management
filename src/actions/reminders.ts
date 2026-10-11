"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies } from "@/db/schema";
import { mutate } from "@/lib/mutate";
import { normaliseSchedule } from "@/lib/reminders/schedule";
import { FORM_FIELD_ERROR_SUMMARY } from "@/lib/validation/field-errors";
import type { ActionResult } from "@/actions/result";

/** Save when clients are reminded about invoices, and whether to add late payment charges. */
export async function saveReminderSettings(formData: FormData): Promise<ActionResult> {
  const remindersEnabled = formData.get("remindersEnabled") === "on";
  const latePaymentCharges = formData.get("latePaymentCharges") === "on";
  const schedule = normaliseSchedule(
    formData.getAll("reminderStep").map((v) => Number(v)).filter(Number.isInteger),
  );
  if (remindersEnabled && schedule.length === 0) {
    return {
      ok: false,
      error: FORM_FIELD_ERROR_SUMMARY,
      fieldErrors: { reminderStep: "Choose at least one reminder, or turn reminders off" },
    };
  }

  return mutate(
    "settings:manage",
    async ({ companyId }) => {
      await getDb()
        .update(companies)
        .set({
          remindersEnabled,
          reminderScheduleDays: schedule,
          latePaymentCharges,
          updatedAt: new Date(),
        })
        .where(eq(companies.id, companyId));
      return { ok: true, id: companyId };
    },
    {
      audit: {
        action: "settings.reminders",
        entityType: "company",
        meta: { remindersEnabled, schedule, latePaymentCharges },
      },
      paths: ["/settings/reminders"],
    },
  );
}
