"use server";

import { revalidatePath } from "next/cache";
import { requireActionPermission } from "@/lib/auth";
import type { ActionResult } from "@/actions/result";
import {
  countUnreadNotifications,
  deletePushSubscription,
  getNotificationForUser,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  softDeleteNotification,
  upsertPushSubscription,
  loadCompanyChannelDefaults,
  loadUserChannelOverrides,
  mergeChannelPrefs,
  saveCompanyChannelDefaults,
  saveUserChannelOverrides,
  parseChannelMatrix,
  type EventChannelMatrix,
} from "@/lib/notifications";
import { ensureLocalUser } from "@/lib/users";

async function requireNotificationUser() {
  const authz = await requireActionPermission("accounts:read");
  if (!authz.ok) return authz;
  if (!authz.user.companyId) {
    return { ok: false as const, error: "Complete onboarding first." };
  }
  const userId =
    authz.user.localUserId ?? (await ensureLocalUser(authz.user));
  return {
    ok: true as const,
    userId,
    companyId: authz.user.companyId,
    role: authz.user.role,
  };
}

export async function fetchNotificationsAction(opts?: {
  filter?: "all" | "unread";
  limit?: number;
}): Promise<
  | {
      ok: true;
      notifications: Awaited<ReturnType<typeof listNotifications>>;
      unreadCount: number;
    }
  | { ok: false; error: string }
> {
  const ctx = await requireNotificationUser();
  if (!ctx.ok) return ctx;
  const [items, unreadCount] = await Promise.all([
    listNotifications({
      userId: ctx.userId,
      companyId: ctx.companyId,
      filter: opts?.filter ?? "all",
      limit: opts?.limit ?? 50,
    }),
    countUnreadNotifications(ctx.userId, ctx.companyId),
  ]);
  return { ok: true, notifications: items, unreadCount };
}

export async function fetchUnreadCountAction(): Promise<
  { ok: true; unreadCount: number } | { ok: false; error: string }
> {
  const ctx = await requireNotificationUser();
  if (!ctx.ok) return ctx;
  const unreadCount = await countUnreadNotifications(
    ctx.userId,
    ctx.companyId,
  );
  return { ok: true, unreadCount };
}

export async function markNotificationReadAction(
  id: string,
): Promise<ActionResult> {
  const ctx = await requireNotificationUser();
  if (!ctx.ok) return ctx;
  await markNotificationRead(id, ctx.userId, ctx.companyId);
  revalidatePath("/inbox");
  return { ok: true, id };
}

export async function markAllNotificationsReadAction(): Promise<ActionResult> {
  const ctx = await requireNotificationUser();
  if (!ctx.ok) return ctx;
  await markAllNotificationsRead(ctx.userId, ctx.companyId);
  revalidatePath("/inbox");
  return { ok: true };
}

export async function deleteNotificationAction(
  id: string,
): Promise<ActionResult> {
  const ctx = await requireNotificationUser();
  if (!ctx.ok) return ctx;
  await softDeleteNotification(id, ctx.userId, ctx.companyId);
  revalidatePath("/inbox");
  return { ok: true, id };
}

export async function getNotificationAction(id: string) {
  const ctx = await requireNotificationUser();
  if (!ctx.ok) return ctx;
  const notification = await getNotificationForUser(
    id,
    ctx.userId,
    ctx.companyId,
  );
  if (!notification) return { ok: false as const, error: "Not found" };
  if (!notification.readAt) {
    await markNotificationRead(id, ctx.userId, ctx.companyId);
  }
  return { ok: true as const, notification };
}

export async function getNotificationPrefsAction(): Promise<
  | {
      ok: true;
      companyDefaults: EventChannelMatrix;
      userOverrides: EventChannelMatrix;
      effective: EventChannelMatrix;
      canManageCompany: boolean;
    }
  | { ok: false; error: string }
> {
  const ctx = await requireNotificationUser();
  if (!ctx.ok) return ctx;
  const [companyDefaults, userOverrides] = await Promise.all([
    loadCompanyChannelDefaults(ctx.companyId),
    loadUserChannelOverrides(ctx.userId, ctx.companyId),
  ]);
  return {
    ok: true,
    companyDefaults,
    userOverrides,
    effective: mergeChannelPrefs(companyDefaults, userOverrides),
    canManageCompany: ctx.role === "admin",
  };
}

export async function saveCompanyNotificationPrefsAction(
  raw: unknown,
): Promise<ActionResult> {
  const authz = await requireActionPermission("settings:manage");
  if (!authz.ok) return authz;
  if (!authz.user.companyId) {
    return { ok: false, error: "Complete onboarding first." };
  }
  const defaults = parseChannelMatrix(raw);
  await saveCompanyChannelDefaults(authz.user.companyId, defaults);
  revalidatePath("/settings");
  revalidatePath("/settings/notifications");
  return { ok: true };
}

export async function saveUserNotificationPrefsAction(
  raw: unknown,
): Promise<ActionResult> {
  const ctx = await requireNotificationUser();
  if (!ctx.ok) return ctx;
  const overrides = parseChannelMatrix(raw);
  await saveUserChannelOverrides(ctx.userId, ctx.companyId, overrides);
  revalidatePath("/profile");
  revalidatePath("/settings/notifications");
  return { ok: true };
}

export async function subscribeWebPushAction(input: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Promise<ActionResult> {
  const ctx = await requireNotificationUser();
  if (!ctx.ok) return ctx;
  if (!input.endpoint || !input.keys?.p256dh || !input.keys?.auth) {
    return { ok: false, error: "Invalid subscription" };
  }
  const id = await upsertPushSubscription({
    userId: ctx.userId,
    companyId: ctx.companyId,
    platform: "web",
    endpoint: input.endpoint,
    keys: input.keys,
    userAgent: null,
  });
  return { ok: true, id };
}

export async function unsubscribeWebPushAction(
  endpoint: string,
): Promise<ActionResult> {
  const ctx = await requireNotificationUser();
  if (!ctx.ok) return ctx;
  await deletePushSubscription(ctx.userId, endpoint);
  return { ok: true };
}
