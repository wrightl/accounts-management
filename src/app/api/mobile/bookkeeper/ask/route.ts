import { NextRequest, NextResponse } from "next/server";
import { askBookkeeperFor, DAILY_QUESTION_LIMIT, questionsAskedToday } from "@/lib/bookkeeper/ask";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { mobileError, mobileServerError } from "@/lib/mobile/respond";
import { ensureLocalUser } from "@/lib/users";

/** Questions left today, for the box on the AI bookkeeper screen. */
export async function GET() {
  try {
    const authz = await requireMobileAuth("reports:read");
    if (!authz.ok) return authz.response;
    const asked = await questionsAskedToday(authz.user.companyId);
    return NextResponse.json({
      success: true,
      data: { remaining: Math.max(DAILY_QUESTION_LIMIT - asked, 0), limit: DAILY_QUESTION_LIMIT },
    });
  } catch (error) {
    return mobileServerError("Bookkeeper ask status error", error);
  }
}

/** Ask a plain-English question about the books, as on the web. Read-only. */
export async function POST(request: NextRequest) {
  try {
    const authz = await requireMobileAuth("reports:read");
    if (!authz.ok) return authz.response;
    const { user } = authz;

    const body = await request.json().catch(() => null);
    const result = await askBookkeeperFor(
      { companyId: user.companyId, localUserId: await ensureLocalUser(user), role: user.role },
      typeof body?.question === "string" ? body.question : "",
    );
    if (!result.ok) return mobileError(result.error, 400);
    return NextResponse.json({
      success: true,
      data: { answer: result.answer, sources: result.sources },
    });
  } catch (error) {
    return mobileServerError("Bookkeeper ask error", error);
  }
}
