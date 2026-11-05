import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { isUuid } from "@/lib/labels/params";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { mobileError, mobileFailure, mobileServerError } from "@/lib/mobile/respond";
import { replyToQueryFor } from "@/lib/queries/reply";
import { ensureLocalUser } from "@/lib/users";

type Params = Promise<{ id: string }>;

/** Reply to a query, as on the web. Closing and reopening stay with the accountant. */
export async function POST(request: NextRequest, segmentData: { params: Params }) {
  const { id } = await segmentData.params;
  try {
    const authz = await requireMobileAuth("queries:read", { checkSuspended: true });
    if (!authz.ok) return authz.response;
    const { user } = authz;
    if (!isUuid(id)) return mobileError("Query not found", 404);

    const body = await request.json().catch(() => null);
    const localUserId = await ensureLocalUser(user);
    const result = await replyToQueryFor(
      { companyId: user.companyId, localUserId, role: user.role },
      id,
      { body: typeof body?.body === "string" ? body.body : "" },
    );
    if (!result.ok) return mobileFailure(result);

    await writeAudit({
      companyId: user.companyId,
      actorUserId: localUserId,
      action: "query.reply",
      entityType: "accountant_query",
      entityId: id,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return mobileServerError("Query reply error", error);
  }
}
