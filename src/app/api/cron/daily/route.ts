import { NextResponse } from "next/server";
import { cronAuthError } from "@/lib/cron";
import { runDailyCron } from "@/lib/cron-daily";
import { logPlatformEvent } from "@/lib/platform-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Vercel Cron (Hobby-safe, once daily): recurring invoice generation, scheduled
 * payment reminders, and the Monday weekly close digest. Individual `/api/cron/reminders` and `/api/cron/recurring`
 * routes remain for manual triggers.
 */
export async function GET(request: Request) {
  const denied = cronAuthError(
    request.headers.get("authorization"),
    process.env.CRON_SECRET,
  );
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  const { recurring, reminders, purged, billingEmails, notifications, weeklyClose } =
    await runDailyCron();

  console.info(
    JSON.stringify({
      level: "info",
      msg: "cron.daily",
      recurring,
      reminders,
      purged,
      billingEmails,
      notifications,
      weeklyClose,
    }),
  );

  await logPlatformEvent({
    level: "info",
    source: "cron.daily",
    message: "Daily cron completed",
    meta: { recurring, reminders, purged, billingEmails, notifications, weeklyClose },
  });

  return NextResponse.json({
    ok: true,
    recurring,
    reminders,
    purged,
    billingEmails,
    notifications,
    weeklyClose,
  });
}
