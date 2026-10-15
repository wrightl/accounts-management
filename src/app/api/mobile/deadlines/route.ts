import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { setDeadlineDone } from "@/lib/deadlines/filings";
import { getDeadlines } from "@/lib/deadlines/queries";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { mobileError, mobileFailure, mobileServerError } from "@/lib/mobile/respond";
import { ensureLocalUser } from "@/lib/users";

/** The deadlines page's list: overdue, due soon, upcoming and recently done. */
export async function GET() {
  try {
    const authz = await requireMobileAuth("accounts:read");
    if (!authz.ok) return authz.response;

    const { deadlines, missingCompaniesHouse } = await getDeadlines(authz.user.companyId);
    return NextResponse.json({
      success: true,
      data: {
        missingCompaniesHouse,
        deadlines: deadlines.map((d) => ({
          kind: d.kind,
          label: d.label,
          dueDate: d.dueDate,
          period: d.period,
          detail: d.detail,
          status: d.status,
          daysLeft: d.daysLeft,
          filedOn: d.filedOn,
          filedByName: d.filedByName,
        })),
      },
    });
  } catch (error) {
    return mobileServerError("Deadlines error", error);
  }
}

/** Mark a deadline done (`done: true`) or put it back on the list. */
export async function POST(request: NextRequest) {
  try {
    const authz = await requireMobileAuth("accounts:write", { checkSuspended: true });
    if (!authz.ok) return authz.response;
    const { user } = authz;

    const body = await request.json().catch(() => null);
    const kind = typeof body?.kind === "string" ? body.kind : "";
    const dueDate = typeof body?.dueDate === "string" ? body.dueDate : "";
    if (typeof body?.done !== "boolean") return mobileError("Say whether it is done", 400);

    const localUserId = await ensureLocalUser(user);
    const result = await setDeadlineDone(
      { companyId: user.companyId, localUserId },
      kind,
      dueDate,
      body.done,
    );
    if (!result.ok) return mobileFailure(result);

    await writeAudit({
      companyId: user.companyId,
      actorUserId: localUserId,
      action: body.done ? "deadline.done" : "deadline.undo",
      entityType: "deadline",
      meta: { kind, dueDate },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return mobileServerError("Deadline update error", error);
  }
}
