import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { ensureLocalUser } from "@/lib/users";
import {
  deletePushSubscription,
  upsertPushSubscription,
} from "@/lib/notifications";

const postSchema = z.object({
  token: z.string().min(8).max(4096),
  platform: z.enum(["fcm", "apns"]).default("fcm"),
});

const deleteSchema = z.object({
  token: z.string().min(8).max(4096),
});

export async function POST(request: Request) {
  const auth = await requireMobileAuth("accounts:read");
  if (!auth.ok) return auth.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON" },
      { status: 400 },
    );
  }

  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid token" },
      { status: 400 },
    );
  }

  const userId =
    auth.user.localUserId ?? (await ensureLocalUser(auth.user));
  const id = await upsertPushSubscription({
    userId,
    companyId: auth.user.companyId,
    platform: parsed.data.platform,
    endpoint: parsed.data.token,
  });

  return NextResponse.json({ success: true, data: { id } });
}

export async function DELETE(request: Request) {
  const auth = await requireMobileAuth("accounts:read");
  if (!auth.ok) return auth.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON" },
      { status: 400 },
    );
  }

  const parsed = deleteSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid token" },
      { status: 400 },
    );
  }

  const userId =
    auth.user.localUserId ?? (await ensureLocalUser(auth.user));
  await deletePushSubscription(userId, parsed.data.token);
  return NextResponse.json({ success: true });
}
