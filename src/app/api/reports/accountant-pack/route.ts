import { NextResponse } from "next/server";
import { requirePermission, ForbiddenError } from "@/lib/auth";
import { streamAccountantPack } from "@/lib/reports/accountant-pack";
import { defaultReportPeriod } from "@/lib/reports/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Accountant pack: zip of CSVs (or one Excel workbook with `format=xlsx`), summary
 * reports, invoice PDFs, and receipt files. Streamed, because Vercel caps buffered responses at 4.5 MB.
 */
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

  // Every plan can export its books; only the VAT summary is a paid feature.
  const { getEntitlements } = await import("@/lib/billing/entitlements");
  const entitlements = await getEntitlements(user.companyId);

  const url = new URL(request.url);
  const defaults = await defaultReportPeriod(user.companyId);
  const from = url.searchParams.get("from") ?? defaults.from;
  const to = url.searchParams.get("to") ?? defaults.to;
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";

  const { filename, stream } = await streamAccountantPack({
    companyId: user.companyId,
    from,
    to,
    includeVat: entitlements.vatExport,
    format,
    // The site this was downloaded from, so the workbook's links come back here.
    webBase: url.origin,
  });

  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
