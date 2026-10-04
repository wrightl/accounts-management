import { NextResponse } from "next/server";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { ensureLocalUser } from "@/lib/users";
import { countUnreadNotifications } from "@/lib/notifications";

export async function GET() {
  const auth = await requireMobileAuth("accounts:read");
  if (!auth.ok) return auth.response;

  const userId =
    auth.user.localUserId ?? (await ensureLocalUser(auth.user));
  const unreadCount = await countUnreadNotifications(
    userId,
    auth.user.companyId,
  );

  return NextResponse.json({
    success: true,
    data: { unreadCount },
  });
}
