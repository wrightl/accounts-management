import { NextResponse } from "next/server";
import { cronAuthError } from "@/lib/cron";
import { generateRecurringInvoices } from "@/lib/invoices/recurring-generate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Manual / debug trigger: generate invoices from enabled recurring templates.
 * Scheduled via `/api/cron/daily` on Vercel (Hobby once-per-day limit).
 * Behind RECURRING_INVOICES_ENABLED=true feature flag.
 */
export async function GET(request: Request) {
  const denied = cronAuthError(
    request.headers.get("authorization"),
    process.env.CRON_SECRET,
  );
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  const result = await generateRecurringInvoices();

  if (result.skipped) {
    return NextResponse.json({ ok: true, skipped: result.skipped });
  }

  console.info(
    JSON.stringify({ level: "info", msg: "cron.recurring", generated: result.generated }),
  );

  return NextResponse.json({ ok: true, generated: result.generated });
}
