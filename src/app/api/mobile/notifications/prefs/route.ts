import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { ensureLocalUser } from "@/lib/users";
import {
  loadCompanyChannelDefaults,
  loadUserChannelOverrides,
  mergeChannelPrefs,
  parseChannelMatrix,
  saveUserChannelOverrides,
} from "@/lib/notifications";
import { NOTIFICATION_CATALOG } from "@/lib/notifications/types";
import { can } from "@/lib/roles";
import { saveCompanyChannelDefaults } from "@/lib/notifications/prefs";

export async function GET() {
  const auth = await requireMobileAuth("accounts:read");
  if (!auth.ok) return auth.response;

  const userId =
    auth.user.localUserId ?? (await ensureLocalUser(auth.user));
  const [companyDefaults, userOverrides] = await Promise.all([
    loadCompanyChannelDefaults(auth.user.companyId),
    loadUserChannelOverrides(userId, auth.user.companyId),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      catalog: NOTIFICATION_CATALOG,
      companyDefaults,
      userOverrides,
      effective: mergeChannelPrefs(companyDefaults, userOverrides),
      canManageCompany: can(auth.user.role, "settings:manage"),
    },
  });
}

const putSchema = z.object({
  scope: z.enum(["user", "company"]),
  matrix: z.record(z.string(), z.unknown()),
});

export async function PUT(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON" },
      { status: 400 },
    );
  }

  const parsed = putSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid request" },
      { status: 400 },
    );
  }

  const matrix = parseChannelMatrix(parsed.data.matrix);

  if (parsed.data.scope === "company") {
    const auth = await requireMobileAuth("settings:manage");
    if (!auth.ok) return auth.response;
    await saveCompanyChannelDefaults(auth.user.companyId, matrix);
    return NextResponse.json({ success: true });
  }

  const auth = await requireMobileAuth("accounts:read");
  if (!auth.ok) return auth.response;
  const userId =
    auth.user.localUserId ?? (await ensureLocalUser(auth.user));
  await saveUserChannelOverrides(userId, auth.user.companyId, matrix);
  return NextResponse.json({ success: true });
}
