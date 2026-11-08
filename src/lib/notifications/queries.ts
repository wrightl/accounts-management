import { and, count, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { notifications, type Notification } from "@/db/schema";
import { type ListPaging, type Paged, fetchPage } from "@/lib/list-paging";

export type NotificationListFilter = "all" | "unread";

export async function listNotifications(opts: {
  userId: string;
  companyId: string;
  filter?: NotificationListFilter;
  limit?: number;
  offset?: number;
}): Promise<Notification[]> {
  const db = getDb();
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const offset = Math.max(opts.offset ?? 0, 0);
  return db
    .select()
    .from(notifications)
    .where(notificationListWhere(opts))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit)
    .offset(offset);
}

function notificationListWhere(opts: {
  userId: string;
  companyId: string;
  filter?: NotificationListFilter;
}) {
  return and(
    eq(notifications.userId, opts.userId),
    eq(notifications.companyId, opts.companyId),
    isNull(notifications.deletedAt),
    opts.filter === "unread" ? isNull(notifications.readAt) : undefined,
  );
}

/** One page of someone's inbox, newest first, with the total across pages. */
export async function listNotificationPage(
  opts: { userId: string; companyId: string; filter?: NotificationListFilter } & ListPaging,
): Promise<Paged<Notification>> {
  const db = getDb();
  const where = notificationListWhere(opts);
  return fetchPage(
    opts,
    async () => (await db.select({ n: count() }).from(notifications).where(where))[0]?.n ?? 0,
    ({ limit, offset }) =>
      db
        .select()
        .from(notifications)
        .where(where)
        .orderBy(desc(notifications.createdAt), desc(notifications.id))
        .limit(limit)
        .offset(offset),
  );
}

export async function countUnreadNotifications(
  userId: string,
  companyId: string,
): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.companyId, companyId),
        isNull(notifications.deletedAt),
        isNull(notifications.readAt),
      ),
    );
  return Number(row?.value ?? 0);
}

export async function getNotificationForUser(
  id: string,
  userId: string,
  companyId: string,
): Promise<Notification | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.id, id),
        eq(notifications.userId, userId),
        eq(notifications.companyId, companyId),
        isNull(notifications.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function markNotificationRead(
  id: string,
  userId: string,
  companyId: string,
): Promise<boolean> {
  const db = getDb();
  const updated = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, id),
        eq(notifications.userId, userId),
        eq(notifications.companyId, companyId),
        isNull(notifications.deletedAt),
        isNull(notifications.readAt),
      ),
    )
    .returning({ id: notifications.id });
  return updated.length > 0;
}

export async function markAllNotificationsRead(
  userId: string,
  companyId: string,
): Promise<number> {
  const db = getDb();
  const updated = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.companyId, companyId),
        isNull(notifications.deletedAt),
        isNull(notifications.readAt),
      ),
    )
    .returning({ id: notifications.id });
  return updated.length;
}

export async function softDeleteNotification(
  id: string,
  userId: string,
  companyId: string,
): Promise<boolean> {
  const db = getDb();
  const updated = await db
    .update(notifications)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(notifications.id, id),
        eq(notifications.userId, userId),
        eq(notifications.companyId, companyId),
        isNull(notifications.deletedAt),
      ),
    )
    .returning({ id: notifications.id });
  return updated.length > 0;
}

/** ISO date (YYYY-MM-DD) for dedupe keys, stable across cron runs. */
export function todayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** Format a calendar date string for display in notification copy. */
export function formatNotifyDate(isoDate: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(`${isoDate}T12:00:00Z`));
  } catch {
    return isoDate;
  }
}
