import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { yearEndRuns } from "@/db/schema";
import type { PackPeriod } from "@/lib/year-end/period";

export type YearEndRun = typeof yearEndRuns.$inferSelect;

export type YearStatus = "not_started" | "checks_outstanding" | "ready" | "exported";

/** Where a year has got to, from what was recorded when it was last reviewed or exported. */
export function yearStatus(run: YearEndRun | undefined): YearStatus {
  if (!run) return "not_started";
  if (run.exportedAt) return "exported";
  return run.outstandingChecks > 0 ? "checks_outstanding" : "ready";
}

export async function listYearEndRuns(companyId: string): Promise<YearEndRun[]> {
  return getDb()
    .select()
    .from(yearEndRuns)
    .where(eq(yearEndRuns.companyId, companyId))
    .orderBy(desc(yearEndRuns.periodTo));
}

export async function getYearEndRun(
  companyId: string,
  period: PackPeriod,
): Promise<YearEndRun | undefined> {
  const [run] = await getDb()
    .select()
    .from(yearEndRuns)
    .where(
      and(
        eq(yearEndRuns.companyId, companyId),
        eq(yearEndRuns.periodFrom, period.from),
        eq(yearEndRuns.periodTo, period.to),
      ),
    )
    .limit(1);
  return run;
}

/** Note that the period's checks were looked at, or that its pack was downloaded. */
export async function recordYearEndRun(
  companyId: string,
  period: PackPeriod,
  outstandingChecks: number,
  exportedByUserId?: string,
): Promise<void> {
  const now = new Date();
  const exported = exportedByUserId ? { exportedAt: now, exportedByUserId } : {};
  await getDb()
    .insert(yearEndRuns)
    .values({
      companyId,
      periodFrom: period.from,
      periodTo: period.to,
      reviewedAt: now,
      outstandingChecks,
      ...exported,
    })
    .onConflictDoUpdate({
      target: [yearEndRuns.companyId, yearEndRuns.periodFrom, yearEndRuns.periodTo],
      set: { reviewedAt: now, outstandingChecks, ...exported },
    });
}
