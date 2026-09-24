import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  companyBilling,
  type BillingInterval,
  type BillingPlan,
} from "@/db/schema";
import { TRIAL_DAYS } from "@/lib/billing/constants";

export function trialEndsAtFrom(now = new Date()): Date {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() + TRIAL_DAYS);
  return d;
}

/** Insert trial billing row if missing (idempotent). Does not overwrite unpaid/paid rows. */
export async function ensureCompanyBilling(companyId: string): Promise<void> {
  const db = getDb();
  const [existing] = await db
    .select({ id: companyBilling.id })
    .from(companyBilling)
    .where(eq(companyBilling.companyId, companyId))
    .limit(1);
  if (existing) return;

  await db.insert(companyBilling).values({
    companyId,
    plan: "trial",
    status: "trialing",
    access: "standard",
    trialEndsAt: trialEndsAtFrom(),
  });
}

export async function startCompanyTrial(companyId: string): Promise<void> {
  const db = getDb();
  await db.insert(companyBilling).values({
    companyId,
    plan: "trial",
    status: "trialing",
    access: "standard",
    trialEndsAt: trialEndsAtFrom(),
  });
}

/**
 * Paid signup before Checkout: plan chosen, payment method not yet collected.
 * Leaves existing rows alone (idempotent if already unpaid for same company).
 * Checkout attaches a 30-day Stripe trial before the first charge.
 */
export async function startCompanyPaidSignup(
  companyId: string,
  plan: Exclude<BillingPlan, "trial">,
  interval: BillingInterval,
): Promise<void> {
  const db = getDb();
  const [existing] = await db
    .select({ id: companyBilling.id, status: companyBilling.status })
    .from(companyBilling)
    .where(eq(companyBilling.companyId, companyId))
    .limit(1);
  if (existing) {
    if (existing.status === "unpaid") {
      await db
        .update(companyBilling)
        .set({
          plan,
          billingInterval: interval,
          trialEndsAt: null,
          updatedAt: new Date(),
        })
        .where(eq(companyBilling.companyId, companyId));
    }
    return;
  }

  await db.insert(companyBilling).values({
    companyId,
    plan,
    status: "unpaid",
    access: "standard",
    billingInterval: interval,
    trialEndsAt: null,
  });
}

/** Convert an unpaid signup company onto the standard 30-day trial. */
export async function switchUnpaidCompanyToTrial(
  companyId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getDb();
  const [billing] = await db
    .select()
    .from(companyBilling)
    .where(eq(companyBilling.companyId, companyId))
    .limit(1);

  if (!billing) {
    await startCompanyTrial(companyId);
    return { ok: true };
  }
  if (billing.stripeSubscriptionId) {
    return {
      ok: false,
      error: "This company already has a Stripe subscription.",
    };
  }
  if (billing.status !== "unpaid") {
    return { ok: false, error: "Only unpaid sign-ups can switch to trial." };
  }

  await db
    .update(companyBilling)
    .set({
      plan: "trial",
      status: "trialing",
      billingInterval: null,
      trialEndsAt: trialEndsAtFrom(),
      updatedAt: new Date(),
    })
    .where(eq(companyBilling.companyId, companyId));

  return { ok: true };
}
