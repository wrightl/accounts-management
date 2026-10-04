import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  notificationPreferences,
  userNotificationPreferences,
} from "@/db/schema";
import {
  mergeChannelPrefs,
  parseChannelMatrix,
  type EventChannelMatrix,
} from "./prefs-merge";

export {
  mergeChannelPrefs,
  parseChannelMatrix,
  resolveChannelsForEvent,
  type EventChannelMatrix,
} from "./prefs-merge";

export async function loadCompanyChannelDefaults(
  companyId: string,
): Promise<EventChannelMatrix> {
  const db = getDb();
  const [row] = await db
    .select({ defaults: notificationPreferences.defaults })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.companyId, companyId))
    .limit(1);
  return parseChannelMatrix(row?.defaults);
}

export async function loadUserChannelOverrides(
  userId: string,
  companyId: string,
): Promise<EventChannelMatrix> {
  const db = getDb();
  const [row] = await db
    .select({ overrides: userNotificationPreferences.overrides })
    .from(userNotificationPreferences)
    .where(
      and(
        eq(userNotificationPreferences.userId, userId),
        eq(userNotificationPreferences.companyId, companyId),
      ),
    )
    .limit(1);
  return parseChannelMatrix(row?.overrides);
}

export async function getEffectiveChannels(
  userId: string,
  companyId: string,
): Promise<EventChannelMatrix> {
  const [company, user] = await Promise.all([
    loadCompanyChannelDefaults(companyId),
    loadUserChannelOverrides(userId, companyId),
  ]);
  return mergeChannelPrefs(company, user);
}

export async function saveCompanyChannelDefaults(
  companyId: string,
  defaults: EventChannelMatrix,
): Promise<void> {
  const db = getDb();
  await db
    .insert(notificationPreferences)
    .values({
      companyId,
      defaults,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: notificationPreferences.companyId,
      set: { defaults, updatedAt: new Date() },
    });
}

export async function saveUserChannelOverrides(
  userId: string,
  companyId: string,
  overrides: EventChannelMatrix,
): Promise<void> {
  const db = getDb();
  await db
    .insert(userNotificationPreferences)
    .values({
      userId,
      companyId,
      overrides,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        userNotificationPreferences.userId,
        userNotificationPreferences.companyId,
      ],
      set: { overrides, updatedAt: new Date() },
    });
}
