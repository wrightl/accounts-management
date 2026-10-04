import { and, count, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { notifications, type Notification } from "@/db/schema";

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
  const conditions = [
    eq(notifications.userId, opts.userId),
    eq(notifications.companyId, opts.companyId),
    isNull(notifications.deletedAt),
  ];
  if (opts.filter === "unread") {
    conditions.push(isNull(notifications.readAt));
  }

  return db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
    .offset(offset);
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
