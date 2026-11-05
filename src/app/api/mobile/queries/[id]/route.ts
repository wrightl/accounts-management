import { NextRequest, NextResponse } from "next/server";
import { isUuid } from "@/lib/labels/params";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { mobileError, mobileServerError } from "@/lib/mobile/respond";
import { getQueryDetail } from "@/lib/queries/queries";
import { queryStatusLabel } from "@/lib/queries/status";

type Params = Promise<{ id: string }>;

/** One query and its messages, oldest first. */
export async function GET(_request: NextRequest, segmentData: { params: Params }) {
  const { id } = await segmentData.params;
  try {
    const authz = await requireMobileAuth("queries:read");
    if (!authz.ok) return authz.response;
    if (!isUuid(id)) return mobileError("Query not found", 404);

    const detail = await getQueryDetail(authz.user.companyId, id);
    if (!detail) return mobileError("Query not found", 404);
    const { query, messages } = detail;
    return NextResponse.json({
      success: true,
      data: {
        id: query.id,
        subject: query.subject,
        status: query.status,
        statusLabel: queryStatusLabel(query.status),
        recordLabel: query.recordLabel,
        messages: messages.map((m) => ({
          id: m.id,
          body: m.body,
          authorName: m.authorName || m.authorEmail || "Someone who has left",
          createdAt: m.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    return mobileServerError("Query error", error);
  }
}
