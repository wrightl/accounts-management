import { NextResponse } from "next/server";
import { requirePermission, ForbiddenError } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { ensureLocalUser } from "@/lib/users";
import { streamYearEndPack } from "@/lib/year-end/pack";
import { parsePeriod } from "@/lib/year-end/period";
import { recordYearEndRun } from "@/lib/year-end/runs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Year-end pack for one accounting period: a zip of the workbook (or one CSV
 * per tab with `format=csv`), receipts, and invoice and credit note PDFs.
 * Streamed, because Vercel caps buffered responses at 4.5 MB.
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

  const url = new URL(request.url);
  const period = parsePeriod(url.searchParams.get("from"), url.searchParams.get("to"));
  if (!period) {
    return NextResponse.json(
      { error: "Choose the accounting period on the Year end page." },
      { status: 400 },
    );
  }

  // Every plan can export its books; only the VAT tab is a paid feature.
  const { getEntitlements } = await import("@/lib/billing/entitlements");
  const entitlements = await getEntitlements(user.companyId);

  const pack = await streamYearEndPack({
    companyId: user.companyId,
    period,
    includeVat: entitlements.vatExport,
    format: url.searchParams.get("format") === "csv" ? "csv" : "xlsx",
  });
  if (!pack.ok) {
    return NextResponse.json(
      {
        error: "Some details are needed before this pack can be downloaded.",
        missing: pack.blockers.map((b) => b.text),
      },
      { status: 409 },
    );
  }

  const companyId = user.companyId;
  const actorUserId = await ensureLocalUser(user);
  // Mark the year exported only once the whole zip has been sent: a download
  // that fails or is cancelled part way never reaches flush.
  const recordWhenSent = new TransformStream<Uint8Array, Uint8Array>({
    async flush() {
      await recordYearEndRun(companyId, period, pack.outstandingChecks, actorUserId);
      await writeAudit({
        companyId,
        actorUserId,
        action: "year_end.export",
        entityType: "year_end_run",
        entityId: `${period.from}_${period.to}`,
        meta: { ...period, outstandingChecks: pack.outstandingChecks },
      });
    },
  });

  return new NextResponse(pack.stream.pipeThrough(recordWhenSent), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${pack.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
