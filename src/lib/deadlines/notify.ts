import "server-only";
import { isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { companies } from "@/db/schema";
import { formatIsoDateLong, todayIsoDate } from "@/lib/dates";
import { getUpcomingDeadlines } from "@/lib/deadlines/queries";
import { notify } from "@/lib/notifications/create";

/** Days before a deadline that a reminder goes out. */
export const DEADLINE_REMINDER_DAYS = [14, 3] as const;

/**
 * Remind each company of open deadlines exactly 14 and 3 days away. Each
 * reminder is sent once (deduped on the deadline and the step).
 */
export async function scanUpcomingDeadlines(today: string = todayIsoDate()): Promise<number> {
  const rows = await getDb()
    .select({ id: companies.id })
    .from(companies)
    .where(isNull(companies.suspendedAt));
  const furthest = Math.max(...DEADLINE_REMINDER_DAYS);

  let created = 0;
  for (const company of rows) {
    const upcoming = await getUpcomingDeadlines(company.id, furthest, today);
    for (const d of upcoming) {
      if (!(DEADLINE_REMINDER_DAYS as readonly number[]).includes(d.daysLeft)) continue;
      const result = await notify({
        companyId: company.id,
        type: "deadline.upcoming",
        title: `${d.label} due in ${d.daysLeft} days`,
        body: [`Due ${formatIsoDateLong(d.dueDate)}.`, d.period].filter(Boolean).join(" "),
        href: "/deadlines",
        entityType: "deadline",
        entityId: null,
        dedupeKey: `deadline.upcoming:${company.id}:${d.kind}:${d.dueDate}:${d.daysLeft}`,
      });
      created += result.created;
    }
  }
  return created;
}
