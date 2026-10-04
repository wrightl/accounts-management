import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { companyMemberships, notifications, users } from "@/db/schema";
import type { TenantRole } from "@/lib/roles";
import { getEventDefinition, type NotifyPayload } from "./types";
import {
  getEffectiveChannels,
  resolveChannelsForEvent,
} from "./prefs";
import { sendNotificationEmail } from "./email";
import { sendPushToUser } from "./push";

async function resolveRecipientIds(
  companyId: string,
  roles: TenantRole[],
  extraUserIds: string[] = [],
): Promise<string[]> {
  const db = getDb();
  const ids = new Set<string>(extraUserIds.filter(Boolean));

  if (roles.length > 0) {
    const members = await db
      .select({ userId: companyMemberships.userId })
      .from(companyMemberships)
      .where(
        and(
          eq(companyMemberships.companyId, companyId),
          inArray(companyMemberships.role, roles),
        ),
      );
    for (const m of members) ids.add(m.userId);

    const active = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(eq(users.companyId, companyId), inArray(users.role, roles)),
      );
    for (const u of active) ids.add(u.id);
  }

  return [...ids];
}

export type NotifyResult = {
  created: number;
  skipped: number;
};

/**
 * Fan out a notification to role recipients (+ optional extra users),
 * respecting per-user channel preferences.
 */
export async function notify(payload: NotifyPayload): Promise<NotifyResult> {
  const def = getEventDefinition(payload.type);
  const roles =
    payload.roles ?? def?.defaultRoles ?? (["admin", "user"] as TenantRole[]);
  const recipientIds = await resolveRecipientIds(
    payload.companyId,
    roles,
    payload.extraUserIds,
  );

  if (recipientIds.length === 0) {
    return { created: 0, skipped: 0 };
  }

  let created = 0;
  let skipped = 0;
  const db = getDb();

  for (const userId of recipientIds) {
    const matrix = await getEffectiveChannels(userId, payload.companyId);
    const channels = resolveChannelsForEvent(matrix, payload.type);

    if (!channels.inApp && !channels.email && !channels.push) {
      skipped += 1;
      continue;
    }

    let notificationId: string | null = null;
    let inserted = false;

    if (channels.inApp) {
      try {
        const [row] = await db
          .insert(notifications)
          .values({
            companyId: payload.companyId,
            userId,
            type: payload.type,
            title: payload.title,
            body: payload.body,
            href: payload.href ?? null,
            entityType: payload.entityType ?? null,
            entityId: payload.entityId ?? null,
            dedupeKey: payload.dedupeKey ?? null,
            meta: payload.meta ?? null,
          })
          .onConflictDoNothing()
          .returning({ id: notifications.id });

        if (!row) {
          // Deduped scheduled reminder — skip email/push too.
          skipped += 1;
          continue;
        }
        notificationId = row.id;
        inserted = true;
        created += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/unique|duplicate/i.test(message)) {
          skipped += 1;
          continue;
        }
        console.warn(
          JSON.stringify({
            level: "warn",
            msg: "notification.insert_failed",
            type: payload.type,
            userId,
            error: message,
          }),
        );
        skipped += 1;
        continue;
      }
    }

    if (channels.email) {
      void sendNotificationEmail({
        userId,
        companyId: payload.companyId,
        title: payload.title,
        body: payload.body,
        href: payload.href ?? null,
      }).catch((error) => {
        console.warn(
          JSON.stringify({
            level: "warn",
            msg: "notification.email_failed",
            userId,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      });
    }

    if (channels.push) {
      void sendPushToUser({
        userId,
        title: payload.title,
        body: payload.body,
        href: payload.href ?? null,
        notificationId,
        type: payload.type,
      }).catch((error) => {
        console.warn(
          JSON.stringify({
            level: "warn",
            msg: "notification.push_failed",
            userId,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      });
    }

    if (!inserted && (channels.email || channels.push)) {
      created += 1;
    }
  }

  return { created, skipped };
}

/** Convenience: notify specific users only (no role fan-out). */
export async function notifyUsers(
  userIds: string[],
  payload: Omit<NotifyPayload, "extraUserIds" | "roles">,
): Promise<NotifyResult> {
  return notify({ ...payload, roles: [], extraUserIds: userIds });
}
