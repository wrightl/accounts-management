import "server-only";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { stripeWebhookEvents } from "@/db/schema";

/**
 * Record the event as handled. Only a duplicate id counts as "already
 * handled"; any other DB error throws so the webhook 500s and Stripe retries.
 */
export async function claimEvent(event: Stripe.Event): Promise<boolean> {
  const db = getDb();
  const inserted = await db
    .insert(stripeWebhookEvents)
    .values({ eventId: event.id, type: event.type })
    .onConflictDoNothing()
    .returning({ eventId: stripeWebhookEvents.eventId });
  return inserted.length > 0;
}

/** Undo a claim so Stripe's retry of a failed event is processed again. */
export async function releaseEvent(eventId: string): Promise<void> {
  const db = getDb();
  await db
    .delete(stripeWebhookEvents)
    .where(eq(stripeWebhookEvents.eventId, eventId));
}
