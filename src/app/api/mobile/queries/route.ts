import { NextRequest, NextResponse } from "next/server";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { mobileServerError } from "@/lib/mobile/respond";
import { listQueries } from "@/lib/queries/queries";
import { isQueryStatus, queryStatusLabel } from "@/lib/queries/status";

/** The accountant's queries, newest activity first, as on the web Queries page. */
export async function GET(request: NextRequest) {
  try {
    const authz = await requireMobileAuth("queries:read");
    if (!authz.ok) return authz.response;

    const status = request.nextUrl.searchParams.get("status");
    const rows = await listQueries(
      authz.user.companyId,
      isQueryStatus(status) ? status : undefined,
    );
    return NextResponse.json({
      success: true,
      data: rows.map((row) => ({
        id: row.id,
        subject: row.subject,
        status: row.status,
        statusLabel: queryStatusLabel(row.status),
        recordLabel: row.recordLabel,
        raisedByName: row.raisedByName || row.raisedByEmail,
        updatedAt: row.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    return mobileServerError("Queries error", error);
  }
}
