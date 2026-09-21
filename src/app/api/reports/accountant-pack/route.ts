import { NextResponse } from "next/server";
import { requirePermission, ForbiddenError } from "@/lib/auth";
import { buildAccountantPack } from "@/lib/reports/accountant-pack";
import { defaultReportPeriod } from "@/lib/reports/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Accountant pack: zip of CSVs, summary reports, invoice PDFs, and receipt files. */
export async function GET(request: Request) {
  let user;
  try {
    user = await requirePermission("reports:export");
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    throw e;
  }
  if (!user.companyId) {
    return NextResponse.json({ error: "Complete onboarding first" }, { status: 403 });
  }

  const { getEntitlements } = await import("@/lib/billing/entitlements");
  const entitlements = await getEntitlements(user.companyId);
  if (!entitlements.vatExport) {
    return NextResponse.json(
      {
        error:
          "VAT export in the accountant pack requires Essentials or Premium. Upgrade to download.",
        code: "feature_not_on_plan",
      },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const defaults = await defaultReportPeriod(user.companyId);
  const from = url.searchParams.get("from") ?? defaults.from;
  const to = url.searchParams.get("to") ?? defaults.to;

  const { filename, zip } = await buildAccountantPack({
    companyId: user.companyId,
    from,
    to,
  });

  return new NextResponse(Buffer.from(zip), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
