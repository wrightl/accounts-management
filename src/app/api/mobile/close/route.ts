import { NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { getLastWeeklyClose, getWeeklyCloseChecklist } from "@/lib/close/checklist";
import { DIGEST_DEADLINE_DAYS } from "@/lib/close/digest";
import { recordWeeklyClose } from "@/lib/close/record";
import { getUpcomingDeadlines } from "@/lib/deadlines/queries";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { mobileFailure, mobileServerError } from "@/lib/mobile/respond";
import { formatGBP } from "@/lib/money";
import { ensureLocalUser } from "@/lib/users";

/** The weekly close checklist, as on the web page. */
export async function GET() {
  try {
    const authz = await requireMobileAuth("accounts:read");
    if (!authz.ok) return authz.response;
    const { companyId } = authz.user;

    const [checklist, last, deadlines] = await Promise.all([
      getWeeklyCloseChecklist(companyId),
      getLastWeeklyClose(companyId),
      getUpcomingDeadlines(companyId, DIGEST_DEADLINE_DAYS),
    ]);
    return NextResponse.json({
      success: true,
      data: {
        outstanding: checklist.outstanding,
        bankReconciledThrough: checklist.bankReconciledThrough,
        items: checklist.items.map((item) => ({
          key: item.key,
          label: item.count > 0 ? item.label : item.doneLabel,
          count: item.count,
          amountFormatted: item.amountPence ? formatGBP(item.amountPence) : null,
        })),
        lastClose: last
          ? { closedAt: last.closedAt.toISOString(), closedByName: last.closedByName }
          : null,
        deadlines: deadlines.map((d) => ({
          kind: d.kind,
          label: d.label,
          dueDate: d.dueDate,
          daysLeft: d.daysLeft,
          status: d.status,
        })),
      },
    });
  } catch (error) {
    return mobileServerError("Weekly close error", error);
  }
}

/** Close the week. Open items are recorded with the close. */
export async function POST() {
  try {
    const authz = await requireMobileAuth("accounts:write", { checkSuspended: true });
    if (!authz.ok) return authz.response;
    const { user } = authz;

    const localUserId = await ensureLocalUser(user);
    const result = await recordWeeklyClose({ companyId: user.companyId, localUserId });
    if (!result.ok) return mobileFailure(result);

    await writeAudit({
      companyId: user.companyId,
      actorUserId: localUserId,
      action: "close.week",
      entityType: "weekly_close",
      entityId: result.id,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return mobileServerError("Close week error", error);
  }
}
