"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies } from "@/db/schema";
import { requireActionPermission } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { ensureLocalUser } from "@/lib/users";
import { getEntitlements } from "@/lib/billing/entitlements";
import { outstandingCount } from "@/lib/year-end/checks";
import { prepareYearEndPack } from "@/lib/year-end/pack";
import { parseIsoDate, todayIsoDate } from "@/lib/dates";
import { mutate } from "@/lib/mutate";
import { parsePeriod } from "@/lib/year-end/period";
import {
  clearStaleConfirmations,
  saveNoteResponses,
  type NoteEntry,
} from "@/lib/year-end/responses";
import { recordYearEndRun } from "@/lib/year-end/runs";
import type { ActionResult } from "@/actions/result";

/**
 * Start (or come back to) a year: runs its checks and records how many items
 * they found, so the Year end page can show where each year has got to. It
 * writes, so it needs the same permission as downloading the pack.
 */
export async function openYearEnd(from: string, to: string): Promise<ActionResult> {
  const authz = await requireActionPermission("reports:export");
  if (!authz.ok) return authz;
  const companyId = authz.user.companyId;
  if (!companyId) return { ok: false, error: "Complete onboarding first." };
  const period = parsePeriod(from, to);
  if (!period) return { ok: false, error: "Choose a start date and an end date, in that order." };

  const entitlements = await getEntitlements(companyId);
  const { checks, notes } = await prepareYearEndPack({
    companyId,
    period,
    includeVat: entitlements.vatExport,
  });
  const outstanding = outstandingCount(checks);
  await recordYearEndRun(companyId, period, outstanding);
  // A tick whose figure has since changed is removed, with the reason kept for the page.
  await clearStaleConfirmations(companyId, period, notes);
  await writeAudit({
    companyId,
    actorUserId: await ensureLocalUser(authz.user),
    action: "year_end.review",
    entityType: "year_end_run",
    entityId: `${period.from}_${period.to}`,
    meta: { ...period, outstandingChecks: outstanding },
  });
  return { ok: true, id: `${period.from}_${period.to}` };
}

/**
 * Save the owner's confirmations, explanations and answers for a period's
 * Notes for the accountant. The figures a tick vouches for are worked out here
 * from the records, not taken from the browser.
 */
export async function saveYearEndNotes(
  from: string,
  to: string,
  entries: NoteEntry[],
): Promise<ActionResult> {
  const authz = await requireActionPermission("reports:export");
  if (!authz.ok) return authz;
  const companyId = authz.user.companyId;
  if (!companyId) return { ok: false, error: "Complete onboarding first." };
  const period = parsePeriod(from, to);
  if (!period) return { ok: false, error: "Choose a start date and an end date, in that order." };
  if (!Array.isArray(entries) || entries.length > 5000) {
    return { ok: false, error: "The notes could not be saved. Reload the page and try again." };
  }
  const clean: NoteEntry[] = entries.map((e) => ({
    key: String(e.key),
    confirmed: e.confirmed === true,
    explanation: typeof e.explanation === "string" ? e.explanation : "",
    answer: e.answer === "yes" || e.answer === "no" ? e.answer : "",
  }));

  const entitlements = await getEntitlements(companyId);
  const { notes } = await prepareYearEndPack({
    companyId,
    period,
    includeVat: entitlements.vatExport,
  });
  const actorUserId = await ensureLocalUser(authz.user);
  await saveNoteResponses(companyId, period, notes, clean, actorUserId);
  await writeAudit({
    companyId,
    actorUserId,
    action: "year_end.notes",
    entityType: "year_end_run",
    entityId: `${period.from}_${period.to}`,
    meta: { ...period, confirmed: clean.filter((e) => e.confirmed).length },
  });
  return { ok: true, id: `${period.from}_${period.to}` };
}

/**
 * Record the date of incorporation (limited company) or the date trading
 * started (sole trader) from the Year end page, when Business settings has none.
 */
export async function saveYearEndStartDate(value: string): Promise<ActionResult> {
  const date = parseIsoDate(value);
  if (!date || date > todayIsoDate()) {
    return { ok: false, error: "Enter a date that is not in the future." };
  }
  return mutate(
    "settings:manage",
    async ({ companyId, entityType }) => {
      await getDb()
        .update(companies)
        .set({
          ...(entityType === "limited_company" ? { incorporatedOn: date } : { tradingStartedOn: date }),
          updatedAt: new Date(),
        })
        .where(eq(companies.id, companyId));
      return { ok: true, id: companyId };
    },
    {
      audit: { action: "company.start_date", entityType: "company", meta: { date } },
      paths: ["/year-end"],
    },
  );
}
