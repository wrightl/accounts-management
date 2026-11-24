import "server-only";
import { isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { companies } from "@/db/schema";
import { formatIsoDateLong } from "@/lib/dates";
import { hmrcConnectionsExpiringBetween } from "@/lib/hmrc/connections";
import { notify } from "@/lib/notifications/create";

/** Days before HMRC access runs out that admins are warned. */
export const HMRC_EXPIRY_WARNING_DAYS = [30, 7] as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Warn each company's admins when Alfa's HMRC access is about to run out:
 * once inside 30 days and again inside 7. Each warning is sent once per
 * connection (deduped on the connection and the step), so a missed daily run
 * catches up the next day.
 */
export async function scanHmrcGrantsExpiring(now: Date = new Date()): Promise<number> {
  const furthest = Math.max(...HMRC_EXPIRY_WARNING_DAYS);
  const rows = await getDb()
    .select({ id: companies.id })
    .from(companies)
    .where(isNull(companies.suspendedAt));

  let created = 0;
  for (const company of rows) {
    const companyId = company.id;
    const expiring = await hmrcConnectionsExpiringBetween(
      companyId,
      now,
      new Date(now.getTime() + furthest * MS_PER_DAY),
    );
    for (const connection of expiring) {
      const daysLeft = Math.ceil((connection.grantExpiresAt.getTime() - now.getTime()) / MS_PER_DAY);
      const step = Math.min(...HMRC_EXPIRY_WARNING_DAYS.filter((d) => daysLeft <= d));
      const expiresOn = formatIsoDateLong(connection.grantExpiresAt.toISOString().slice(0, 10));
      const result = await notify({
        companyId,
        type: "hmrc.grant_expiring",
        title: `HMRC access ends in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}`,
        body: `Alfa's access to HMRC runs out on ${expiresOn}. Connect again in Settings to keep filing from Alfa.`,
        href: "/settings/hmrc",
        entityType: "hmrc_connection",
        entityId: connection.id,
        dedupeKey: `hmrc.grant_expiring:${connection.id}:${step}`,
      });
      created += result.created;
    }
  }
  return created;
}
