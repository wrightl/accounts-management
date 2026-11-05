import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { LABEL_COLORS } from "@/lib/labels/colors";
import { createLabel, listLabels } from "@/lib/labels/queries";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { mobileError, mobileServerError } from "@/lib/mobile/respond";
import { ensureLocalUser } from "@/lib/users";

/** The company's labels, for tagging and filtering expenses. */
export async function GET() {
  try {
    const authz = await requireMobileAuth("accounts:read");
    if (!authz.ok) return authz.response;
    const labels = await listLabels(authz.user.companyId);
    return NextResponse.json({
      success: true,
      data: {
        labels: labels.map(({ id, name, color }) => ({ id, name, color })),
        colors: LABEL_COLORS,
      },
    });
  } catch (error) {
    return mobileServerError("Labels error", error);
  }
}

const createSchema = z.object({
  name: z.string(),
  color: z.enum(LABEL_COLORS),
});

/** Add a label, as on the web's Manage labels. */
export async function POST(request: NextRequest) {
  try {
    const authz = await requireMobileAuth("accounts:write", { checkSuspended: true });
    if (!authz.ok) return authz.response;
    const { user } = authz;

    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return mobileError("Choose a name and a colour", 400);
    const { name, color } = parsed.data;

    const result = await createLabel(user.companyId, { name, color });
    if (!result.ok) return mobileError(result.error, 400);

    await writeAudit({
      companyId: user.companyId,
      actorUserId: await ensureLocalUser(user),
      action: "label.create",
      entityType: "label",
      entityId: result.id,
      meta: { name, color },
    });
    return NextResponse.json({ success: true, data: { id: result.id } }, { status: 201 });
  } catch (error) {
    return mobileServerError("Create label error", error);
  }
}
