import { NextResponse } from "next/server";
import { cronAuthError } from "@/lib/cron";
import { generateRecurringInvoices } from "@/lib/invoices/recurring-generate";
import { drainSendJobs, enqueueOverdueReminders } from "@/lib/outbox";
import { updatePlatformSettings } from "@/lib/platform-settings";
import { logPlatformEvent, purgeOldPlatformLogs } from "@/lib/platform-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Vercel Cron (Hobby-safe, once daily): recurring invoice generation + overdue
 * reminder enqueue/drain. Individual `/api/cron/reminders` and `/api/cron/recurring`
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

  const recurring = await generateRecurringInvoices();

  let reminders: Record<string, unknown> = { skipped: "no database" };
  let purged = 0;

  if (process.env.DATABASE_URL) {
    const queued = await enqueueOverdueReminders();
    const drained = await drainSendJobs();
    reminders = { queued, ...drained };
    purged = await purgeOldPlatformLogs(90);
    await updatePlatformSettings({ lastCronDailyAt: new Date() });
  }

  console.info(
    JSON.stringify({
      level: "info",
      msg: "cron.daily",
      recurring,
      reminders,
      purged,
    }),
  );

  await logPlatformEvent({
    level: "info",
    source: "cron.daily",
    message: "Daily cron completed",
    meta: { recurring, reminders, purged },
  });

  return NextResponse.json({ ok: true, recurring, reminders, purged });
}
