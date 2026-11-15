import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { requirePermission, ForbiddenError } from "@/lib/auth";
import { parsePeriod } from "@/lib/year-end/period";

export const dynamic = "force-dynamic";

/**
 * The accountant pack used to download from here. It now lives on the Year end
 * page, which picks the accounting year and runs the checks first.
 */
export async function GET(request: Request) {
  try {
    await requirePermission("reports:export");
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    throw e;
  }
  const url = new URL(request.url);
  const period = parsePeriod(url.searchParams.get("from"), url.searchParams.get("to"));
  redirect(period ? `/year-end?from=${period.from}&to=${period.to}` : "/year-end");
}
