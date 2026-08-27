import { NextResponse } from "next/server";
import { cronAuthError } from "@/lib/cron";
import { drainSendJobs, enqueueOverdueReminders } from "@/lib/outbox";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Manual / debug trigger: enqueue overdue reminders and drain the send/remind outbox.
 * Scheduled via `/api/cron/daily` on Vercel (Hobby once-per-day limit).
 * Does not persist overdue as an invoice status — that is computed from due date.
 */
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

  const queued = await enqueueOverdueReminders();
  const drained = await drainSendJobs();

  console.info(
    JSON.stringify({
      level: "info",
      msg: "cron.reminders",
      queued,
      ...drained,
    }),
  );

  return NextResponse.json({ ok: true, queued, ...drained });
}
