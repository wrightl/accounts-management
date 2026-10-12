import "server-only";
import { isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { companies } from "@/db/schema";
import { formatIsoDateUk, isMonday, todayIsoDate } from "@/lib/dates";
import { getWeeklyCloseChecklist } from "@/lib/close/checklist";
import { getUpcomingDeadlines } from "@/lib/deadlines/queries";
import { formatGBP } from "@/lib/money";

/** Deadlines this close (and any overdue) are listed in the digest. */
export const DIGEST_DEADLINE_DAYS = 14;

/**
 * Monday's weekly close digest: one notification per company with anything
 * to clear or a filing deadline within two weeks (in-app, email and push by
 * default). Quiet weeks get nothing.
 */
export async function sendWeeklyCloseDigests(
  today: string = todayIsoDate(),
): Promise<{ companies: number; notified: number }> {
  if (!isMonday(today)) return { companies: 0, notified: 0 };
  const { notify } = await import("@/lib/notifications");
  const rows = await getDb()
    .select({ id: companies.id })
    .from(companies)
    .where(isNull(companies.suspendedAt));

  let notified = 0;
  for (const company of rows) {
    const [checklist, deadlines] = await Promise.all([
      getWeeklyCloseChecklist(company.id, today),
      getUpcomingDeadlines(company.id, DIGEST_DEADLINE_DAYS, today),
    ]);
    const open = checklist.items.filter((i) => i.count > 0);
    if (open.length === 0 && deadlines.length === 0) continue;
    const lines = [
      ...open.map(
        (i) => `${i.label}: ${i.count}${i.amountPence ? ` (${formatGBP(i.amountPence)})` : ""}`,
      ),
      ...deadlines.map(
        (d) =>
          `${d.status === "overdue" ? "Overdue" : "Due"} ${formatIsoDateUk(d.dueDate)}: ${d.label}`,
      ),
    ];
    const count = open.length + deadlines.length;
    const result = await notify({
      companyId: company.id,
      type: "close.weekly",
      title: `Weekly close: ${count} thing${count === 1 ? "" : "s"} to clear`,
      body: lines.join("\n"),
      href: "/close",
      entityType: "company",
      entityId: company.id,
      dedupeKey: `close.weekly:${company.id}:${today}`,
    });
    if (result.created > 0) notified++;
  }
  return { companies: rows.length, notified };
}
