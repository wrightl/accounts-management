import { NextResponse } from "next/server";
import { cronAuthError } from "@/lib/cron";
import { drainInboundEmailJobs } from "@/lib/expenses/inbound-email";
import { updatePlatformSettings } from "@/lib/platform-settings";
import { logPlatformEvent } from "@/lib/platform-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Retry failed or stuck inbound expense email jobs (GitHub Actions every 15m). */
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
  await updatePlatformSettings({ lastCronInboundAt: new Date() });

  console.info(
    JSON.stringify({
      level: "info",
      msg: "cron.inbound-email",
      ...drained,
    }),
  );

  await logPlatformEvent({
    level: "info",
    source: "cron.inbound-email",
    message: "Inbound email drain completed",
    meta: { ...drained },
  });

  return NextResponse.json({ ok: true, ...drained });
}
