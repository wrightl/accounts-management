import { NextResponse } from "next/server";
import { Resend } from "resend";
import { requireEnv } from "@/env";
import {
  drainInboundEmailJobs,
  enqueueInboundEmailJob,
  processInboundEmailJob,
} from "@/lib/expenses/inbound-email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook is not configured" }, { status: 503 });
  }

  const payload = await request.text();
  const resend = new Resend(process.env.RESEND_API_KEY);

  let event;
  try {
    event = resend.webhooks.verify({
      payload,
      headers: {
        id: request.headers.get("svix-id") ?? "",
        timestamp: request.headers.get("svix-timestamp") ?? "",
        signature: request.headers.get("svix-signature") ?? "",
      },
      webhookSecret,
    });
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type !== "email.received") {
    return NextResponse.json({ ok: true, ignored: event.type });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: true, skipped: "no database" });
  }

  // Receiving API calls require the API key at processing time.
  requireEnv("RESEND_API_KEY");

  const { email_id, from, to, subject } = event.data;
  const { jobId, skipped } = await enqueueInboundEmailJob({
    email_id,
    from,
    to,
    subject,
  });

  if (skipped || !jobId) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const result = await processInboundEmailJob(jobId);
  if (!result.ok) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "webhook.resend.inbound",
        jobId,
        resendEmailId: email_id,
        error: result.error,
      }),
    );
  }

  // Opportunistic drain so other pending/failed jobs clear when mail is flowing.
  const drained = await drainInboundEmailJobs(5);

  return NextResponse.json({
    ok: true,
    jobId,
    processed: result.ok,
    expenseId: result.expenseId ?? null,
    drained,
  });
}
