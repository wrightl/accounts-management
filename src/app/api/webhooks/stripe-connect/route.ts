import { NextResponse } from "next/server";
import { handleStripeConnectWebhook } from "@/lib/payments/online";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Connect endpoint: events from customers' connected Stripe accounts. */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  const result = await handleStripeConnectWebhook(rawBody, signature);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ received: true });
}
