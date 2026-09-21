import { NextResponse } from "next/server";
import { requirePermission, ForbiddenError } from "@/lib/auth";
import { defaultReportPeriod, getVatSummary } from "@/lib/reports/queries";
import { formatGBP } from "@/lib/money";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function gbp(pence: number): string {
  return formatGBP(pence).replace(/[£,]/g, "");
}

/** Period VAT summary CSV for accountant bridging (not HMRC submit). */
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
          "VAT export is available on Essentials and Premium. Upgrade to download the VAT CSV.",
        code: "feature_not_on_plan",
      },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const defaults = await defaultReportPeriod(user.companyId);
  const from = url.searchParams.get("from") ?? defaults.from;
  const to = url.searchParams.get("to") ?? defaults.to;

  const vat = await getVatSummary(user.companyId, from, to);
  const lines = [
    ["metric", "value_gbp", "note"],
    ["vat_on_sales", gbp(vat.vatOnSalesPence), ""],
    ["vat_on_purchases", gbp(vat.vatOnPurchasesPence), ""],
    ["net_vat", gbp(vat.netVatPence), vat.note],
    ["period_from", from, ""],
    ["period_to", to, ""],
    ["vat_number", vat.vatNumber ?? "", ""],
  ];
  const csv = lines.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vat-${from}-to-${to}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
