"use server";

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { dataOnboarding, type DataOnboardingOverride } from "@/db/schema";
import { getDateFormat } from "@/lib/date-format.server";
import { parseIsoDate, todayIsoDate } from "@/lib/dates";
import { getDataOnboarding } from "@/lib/data-onboarding/queries";
import { isStepId } from "@/lib/data-onboarding/steps";
import { mutate } from "@/lib/mutate";
import { FORM_FIELD_ERROR_SUMMARY } from "@/lib/validation/field-errors";
import type { ActionResult } from "@/actions/result";

const OVERRIDE_STATES: readonly DataOnboardingOverride["state"][] = [
  "done",
  "skipped",
  "not_applicable",
];

/** Audited against the company (each action returns its id), and refresh where the checklist shows. */
function after(action: string, meta?: Record<string, unknown>) {
  return {
    audit: { action, entityType: "company", meta },
    paths: ["/dashboard", "/settings"],
  };
}

/** Insert the company's row if it has none, then apply `set` to it. */
async function upsert(companyId: string, set: Partial<typeof dataOnboarding.$inferInsert>) {
  await getDb()
    .insert(dataOnboarding)
    .values({ companyId, ...set })
    .onConflictDoUpdate({
      target: dataOnboarding.companyId,
      set: { ...set, updatedAt: new Date() },
    });
}

/** Start the checklist, or reopen it after it was hidden. */
export async function startDataOnboarding(): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    async ({ companyId }) => {
      await upsert(companyId, { status: "active", pausedAt: null, completedAt: null });
      return { ok: true, id: companyId };
    },
    after("data_onboarding.start"),
  );
}

export async function pauseDataOnboarding(): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    async ({ companyId }) => {
      await getDb()
        .update(dataOnboarding)
        .set({ status: "paused", pausedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(dataOnboarding.companyId, companyId), eq(dataOnboarding.status, "active")));
      return { ok: true, id: companyId };
    },
    after("data_onboarding.pause"),
  );
}

export async function resumeDataOnboarding(): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    async ({ companyId }) => {
      await getDb()
        .update(dataOnboarding)
        .set({ status: "active", pausedAt: null, updatedAt: new Date() })
        .where(and(eq(dataOnboarding.companyId, companyId), eq(dataOnboarding.status, "paused")));
      return { ok: true, id: companyId };
    },
    after("data_onboarding.resume"),
  );
}

/**
 * Hide the checklist: "Not now" before starting, or "Hide" once everything is
 * done. It is recorded as completed only when nothing is left to do.
 */
export async function hideDataOnboarding(): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    async ({ companyId, entityType }) => {
      const view = await getDataOnboarding(companyId, entityType, await getDateFormat());
      const complete = view.status !== "not_started" && view.checklist.complete;
      await upsert(
        companyId,
        complete
          ? { status: "completed", completedAt: new Date() }
          : { status: "dismissed" },
      );
      return { ok: true, id: companyId };
    },
    after("data_onboarding.hide"),
  );
}

/** The first day the company's records in Alfa should cover. */
export async function setRecordsStartDate(formData: FormData): Promise<ActionResult> {
  const raw = String(formData.get("recordsStartDate") ?? "").trim();
  const date = parseIsoDate(raw);
  const error = !date
    ? "Enter a valid date"
    : date > todayIsoDate()
      ? "Choose today or an earlier date"
      : null;
  if (error || !date) {
    return {
      ok: false,
      error: FORM_FIELD_ERROR_SUMMARY,
      fieldErrors: { recordsStartDate: error ?? "Enter a valid date" },
    };
  }
  return mutate(
    "accounts:write",
    async ({ companyId }) => {
      await upsert(companyId, { recordsStartDate: date });
      return { ok: true, id: companyId };
    },
    after("data_onboarding.start_date", { recordsStartDate: date }),
  );
}

/** Mark a step done, skipped or not applicable by hand; null reopens it. */
export async function setStepOverride(
  stepId: string,
  state: DataOnboardingOverride["state"] | null,
): Promise<ActionResult> {
  if (!isStepId(stepId)) return { ok: false, error: "Unknown step." };
  if (state !== null && !OVERRIDE_STATES.includes(state)) {
    return { ok: false, error: "Unknown choice." };
  }
  return mutate(
    "accounts:write",
    async ({ companyId, localUserId }) => {
      const override: DataOnboardingOverride | null = state
        ? { state, at: new Date().toISOString(), byUserId: localUserId }
        : null;
      // Changed in the statement, so two people ticking different steps don't overwrite each other.
      const overrides = override
        ? sql`${dataOnboarding.overrides} || jsonb_build_object(${stepId}::text, ${JSON.stringify(override)}::jsonb)`
        : sql`${dataOnboarding.overrides} - ${stepId}::text`;
      const updated = await getDb()
        .update(dataOnboarding)
        .set({ overrides, updatedAt: new Date() })
        .where(eq(dataOnboarding.companyId, companyId))
        .returning({ companyId: dataOnboarding.companyId });
      if (updated.length === 0) return { ok: false, error: "Start the checklist first." };
      return { ok: true, id: companyId };
    },
    after("data_onboarding.step", { stepId, state }),
  );
}

/** Remember the step someone opened, so Continue takes them back to it. */
export async function markStepVisited(stepId: string): Promise<ActionResult> {
  if (!isStepId(stepId)) return { ok: false, error: "Unknown step." };
  return mutate("accounts:write", async ({ companyId }) => {
    await getDb()
      .update(dataOnboarding)
      .set({ lastStepId: stepId, updatedAt: new Date() })
      .where(eq(dataOnboarding.companyId, companyId));
    return { ok: true, id: companyId };
  });
}
