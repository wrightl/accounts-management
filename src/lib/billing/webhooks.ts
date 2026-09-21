import "server-only";
import type Stripe from "stripe";
import { getDb } from "@/db";
import { stripeWebhookEvents } from "@/db/schema";
import { getStripe } from "@/lib/billing/stripe";
import {
  applySubscriptionToCompany,
  findCompanyIdByStripeCustomer,
  findCompanyIdBySubscription,
  markSubscriptionCanceled,
} from "@/lib/billing/sync";

async function claimEvent(event: Stripe.Event): Promise<boolean> {
  const db = getDb();
  try {
    await db.insert(stripeWebhookEvents).values({
      eventId: event.id,
      type: event.type,
    });
    return true;
  } catch {
    return false;
  }
}

async function resolveCompanyIdFromSubscription(
  sub: Stripe.Subscription,
): Promise<string | null> {
  const fromMeta = sub.metadata?.companyId;
  if (fromMeta) return fromMeta;
  const bySub = await findCompanyIdBySubscription(sub.id);
  if (bySub) return bySub;
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (customerId) return findCompanyIdByStripeCustomer(customerId);
  return null;
}

export async function processStripeEvent(event: Stripe.Event): Promise<void> {
  const claimed = await claimEvent(event);
  if (!claimed) return;

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription") break;
      const companyId = session.metadata?.companyId;
      const subId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;
      if (!companyId || !subId) break;
      const stripe = getStripe();
      const sub = await stripe.subscriptions.retrieve(subId);
      await applySubscriptionToCompany(companyId, sub);
      // Fire subscription_started email (best-effort).
      try {
        const { sendBillingEmail } = await import("@/lib/billing/emails");
        await sendBillingEmail(companyId, "subscription_started", subId);
      } catch {
        /* emails module may load later */
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const companyId = await resolveCompanyIdFromSubscription(sub);
      if (!companyId) break;
      const prevStatus = (
        event.data as { previous_attributes?: { status?: string } }
      ).previous_attributes?.status;
      await applySubscriptionToCompany(companyId, sub);
      if (sub.status === "active" && prevStatus === "past_due") {
        try {
          const { sendBillingEmail } = await import("@/lib/billing/emails");
          await sendBillingEmail(companyId, "payment_recovered", event.id);
        } catch {
          /* ignore */
        }
      }
      if (sub.cancel_at_period_end) {
        try {
          const { sendBillingEmail } = await import("@/lib/billing/emails");
          await sendBillingEmail(
            companyId,
            "subscription_canceled",
            `cancel_${sub.id}`,
          );
        } catch {
          /* ignore */
        }
      }
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const companyId = await resolveCompanyIdFromSubscription(sub);
      if (!companyId) break;
      await markSubscriptionCanceled(companyId);
      try {
        const { sendBillingEmail } = await import("@/lib/billing/emails");
        await sendBillingEmail(
          companyId,
          "subscription_canceled",
          `deleted_${sub.id}`,
        );
      } catch {
        /* ignore */
      }
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId =
        typeof invoice.customer === "string"
          ? invoice.customer
          : invoice.customer?.id;
      if (!customerId) break;
      const companyId = await findCompanyIdByStripeCustomer(customerId);
      if (!companyId) break;
      try {
        const { sendBillingEmail } = await import("@/lib/billing/emails");
        await sendBillingEmail(companyId, "payment_failed", event.id);
      } catch {
        /* ignore */
      }
      break;
    }
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const subRef = (
        invoice as { subscription?: string | { id: string } | null }
      ).subscription;
      const subId =
        typeof subRef === "string" ? subRef : subRef?.id ?? null;
      if (!subId) break;
      const stripe = getStripe();
      const sub = await stripe.subscriptions.retrieve(subId);
      const companyId = await resolveCompanyIdFromSubscription(sub);
      if (!companyId) break;
      await applySubscriptionToCompany(companyId, sub);
      break;
    }
    default:
      break;
  }
}

/** Verify signature and process. */
export async function handleStripeWebhook(
  rawBody: string,
  signature: string | null,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return { ok: false, error: "Webhook secret not configured", status: 500 };
  }
  if (!signature) {
    return { ok: false, error: "Missing stripe-signature", status: 400 };
  }
  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Invalid signature",
      status: 400,
    };
  }
  await processStripeEvent(event);
  return { ok: true };
}
