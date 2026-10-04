import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { ensureLocalUser } from "@/lib/users";
import {
  markAllNotificationsRead,
  markNotificationRead,
  softDeleteNotification,
} from "@/lib/notifications";

const bodySchema = z.object({
  action: z.enum(["mark_read", "mark_all_read", "delete"]),
  id: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const auth = await requireMobileAuth("accounts:read");
  if (!auth.ok) return auth.response;

  const userId =
    auth.user.localUserId ?? (await ensureLocalUser(auth.user));

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON" },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid request" },
      { status: 400 },
    );
  }

  const { action, id } = parsed.data;

  if (action === "mark_all_read") {
    const count = await markAllNotificationsRead(userId, auth.user.companyId);
    return NextResponse.json({ success: true, data: { count } });
  }

  if (!id) {
    return NextResponse.json(
      { success: false, error: "id is required" },
      { status: 400 },
    );
  }

  if (action === "mark_read") {
    await markNotificationRead(id, userId, auth.user.companyId);
    return NextResponse.json({ success: true });
  }

  await softDeleteNotification(id, userId, auth.user.companyId);
  return NextResponse.json({ success: true });
}
