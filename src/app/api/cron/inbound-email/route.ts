import { NextResponse } from "next/server";
import { cronAuthError } from "@/lib/cron";
import { drainInboundEmailJobs } from "@/lib/expenses/inbound-email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Retry failed or stuck inbound expense email jobs. */
export async function GET(request: Request) {
  const denied = cronAuthError(
    request.headers.get("authorization"),
    process.env.CRON_SECRET,
  );
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: true, skipped: "no database" });
  }

  const drained = await drainInboundEmailJobs();

  console.info(
    JSON.stringify({
      level: "info",
      msg: "cron.inbound-email",
      ...drained,
    }),
  );

  return NextResponse.json({ ok: true, ...drained });
}
