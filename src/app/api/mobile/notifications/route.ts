import { NextResponse } from "next/server";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { ensureLocalUser } from "@/lib/users";
import {
  countUnreadNotifications,
  listNotifications,
} from "@/lib/notifications";

export async function GET(request: Request) {
  const auth = await requireMobileAuth("accounts:read");
  if (!auth.ok) return auth.response;

  const userId =
    auth.user.localUserId ?? (await ensureLocalUser(auth.user));
  const url = new URL(request.url);
  const filter =
    url.searchParams.get("filter") === "unread" ? "unread" : "all";
  const limit = Number(url.searchParams.get("limit") ?? "50");

  const [items, unreadCount] = await Promise.all([
    listNotifications({
      userId,
      companyId: auth.user.companyId,
      filter,
      limit: Number.isFinite(limit) ? limit : 50,
    }),
    countUnreadNotifications(userId, auth.user.companyId),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      notifications: items.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        href: n.href,
        entityType: n.entityType,
        entityId: n.entityId,
        readAt: n.readAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
      })),
      unreadCount,
    },
  });
}
