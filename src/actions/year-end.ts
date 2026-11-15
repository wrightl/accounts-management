"use server";

import { requireActionPermission } from "@/lib/auth";
import { getEntitlements } from "@/lib/billing/entitlements";
import { outstandingCount } from "@/lib/year-end/checks";
import { prepareYearEndPack } from "@/lib/year-end/pack";
import { parsePeriod } from "@/lib/year-end/period";
import { recordYearEndRun } from "@/lib/year-end/runs";
import type { ActionResult } from "@/actions/result";

/**
 * Start (or come back to) a year: runs its checks and records how many items
 * they found, so the Year end page can show where each year has got to.
 */
export async function openYearEnd(from: string, to: string): Promise<ActionResult> {
  const authz = await requireActionPermission("filing:read");
  if (!authz.ok) return authz;
  const companyId = authz.user.companyId;
  if (!companyId) return { ok: false, error: "Complete onboarding first." };
  const period = parsePeriod(from, to);
  if (!period) return { ok: false, error: "Choose a start date and an end date, in that order." };

  const entitlements = await getEntitlements(companyId);
  const { checks } = await prepareYearEndPack({
    companyId,
    period,
    includeVat: entitlements.vatExport,
  });
  await recordYearEndRun(companyId, period, outstandingCount(checks));
  return { ok: true, id: `${period.from}_${period.to}` };
}
