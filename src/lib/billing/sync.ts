import "server-only";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { getDb } from "@/db";
import {
  companyBilling,
  type BillingInterval,
  type BillingPlan,
  type BillingStatus,
} from "@/db/schema";
import { planFromPriceId } from "@/lib/billing/stripe";

function mapStripeStatus(status: Stripe.Subscription.Status): BillingStatus {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    case "unpaid":
    case "paused":
      return "unpaid";
    case "incomplete":
      return "past_due";
    default:
      return "canceled";
  }
}

function subscriptionPriceId(sub: Stripe.Subscription): string | null {
  const item = sub.items?.data?.[0];
  const price = item?.price;
  if (!price) return null;
  return typeof price === "string" ? price : price.id;
}

function periodEnd(sub: Stripe.Subscription): Date | null {
  // API versions vary: current_period_end on subscription or on items.
  const end =
    (sub as { current_period_end?: number }).current_period_end ??
    sub.items?.data?.[0]?.current_period_end;
  return typeof end === "number" ? new Date(end * 1000) : null;
}

export async function applySubscriptionToCompany(
  companyId: string,
  sub: Stripe.Subscription,
): Promise<void> {
  const mapped = planFromPriceId(subscriptionPriceId(sub));
  const plan: BillingPlan = mapped?.plan ?? "essentials";
  const interval: BillingInterval | null = mapped?.interval ?? null;
  const status = mapStripeStatus(sub.status);
  const now = new Date();

  const db = getDb();
  const [existing] = await db
    .select()
    .from(companyBilling)
    .where(eq(companyBilling.companyId, companyId))
    .limit(1);

  const pastDueSince =
    status === "past_due"
      ? existing?.pastDueSince ?? now
      : null;

  const values = {
    plan,
    status,
    stripeCustomerId:
      typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null,
    stripeSubscriptionId: sub.id,
    billingInterval: interval,
    currentPeriodEnd: periodEnd(sub),
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    pastDueSince,
    updatedAt: now,
  };

  if (existing) {
    await db
      .update(companyBilling)
      .set(values)
      .where(eq(companyBilling.companyId, companyId));
  } else {
    await db.insert(companyBilling).values({
      companyId,
      access: "standard",
      trialEndsAt: null,
      ...values,
    });
  }
}

export async function findCompanyIdByStripeCustomer(
  customerId: string,
): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ companyId: companyBilling.companyId })
    .from(companyBilling)
    .where(eq(companyBilling.stripeCustomerId, customerId))
    .limit(1);
  return row?.companyId ?? null;
}

export async function findCompanyIdBySubscription(
  subscriptionId: string,
): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ companyId: companyBilling.companyId })
    .from(companyBilling)
    .where(eq(companyBilling.stripeSubscriptionId, subscriptionId))
    .limit(1);
  return row?.companyId ?? null;
}

export async function markSubscriptionCanceled(
  companyId: string,
): Promise<void> {
  const db = getDb();
  await db
    .update(companyBilling)
    .set({
      status: "canceled",
      cancelAtPeriodEnd: false,
      updatedAt: new Date(),
    })
    .where(eq(companyBilling.companyId, companyId));
}
