import { NextResponse } from "next/server";
import { handleStripeWebhook } from "@/lib/billing/webhooks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  const result = await handleStripeWebhook(rawBody, signature);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ received: true });
}
