"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { companies, companyBilling } from "@/db/schema";
import type { ActionResult } from "@/actions/result";
import {
  appBaseUrl,
  checkoutIntegrationId,
  getStripe,
  isStripeConfigured,
  stripePriceId,
  stripeTaxEnabled,
} from "@/lib/billing/stripe";
import { ensureCompanyBilling } from "@/lib/billing/company-billing";

const checkoutSchema = z.object({
  plan: z.enum(["essentials", "premium"]),
  interval: z.enum(["month", "year"]),
});

export async function createCheckoutSession(
  formData: FormData,
): Promise<ActionResult> {
  const parsed = checkoutSchema.safeParse({
    plan: formData.get("plan"),
    interval: formData.get("interval"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Choose a valid plan and billing interval." };
  }
  if (!isStripeConfigured()) {
    return {
      ok: false,
      error: "Billing is not configured yet. Contact support.",
    };
  }

  const { requireActionPermission } = await import("@/lib/auth");
  const authz = await requireActionPermission("settings:manage");
  if (!authz.ok) return authz;
  if (!authz.user.companyId) {
    return { ok: false, error: "Complete onboarding first." };
  }

  const companyId = authz.user.companyId;
  await ensureCompanyBilling(companyId);

  const db = getDb();
  const [billing] = await db
    .select()
    .from(companyBilling)
    .where(eq(companyBilling.companyId, companyId))
    .limit(1);
  const [company] = await db
    .select({
      name: companies.name,
      email: companies.email,
      vatNumber: companies.vatNumber,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  const stripe = getStripe();
  let customerId = billing?.stripeCustomerId ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: company?.email ?? authz.user.email ?? undefined,
      name: company?.name ?? undefined,
      metadata: { companyId },
    });
    customerId = customer.id;
    if (company?.vatNumber) {
      try {
        await stripe.customers.createTaxId(customerId, {
          type: "gb_vat",
          value: company.vatNumber,
        });
      } catch {
        // Invalid VAT on file — Checkout still works without it.
      }
    }
    await db
      .update(companyBilling)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(companyBilling.companyId, companyId));
  }

  const price = stripePriceId(parsed.data.plan, parsed.data.interval);
  const base = appBaseUrl();

  let trialDays: number | undefined;
  if (billing?.status === "trialing" && billing.trialEndsAt) {
    const remainingMs = billing.trialEndsAt.getTime() - Date.now();
    const days = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
    if (days > 0) trialDays = Math.min(days, 30);
  }

  const sessionParams: Parameters<typeof stripe.checkout.sessions.create>[0] = {
    mode: "subscription",
    customer: customerId,
    line_items: [{ price, quantity: 1 }],
    success_url: `${base}/settings/billing?checkout=success`,
    cancel_url: `${base}/settings/billing?checkout=cancel`,
    client_reference_id: companyId,
    metadata: { companyId, plan: parsed.data.plan },
    subscription_data: {
      metadata: { companyId, plan: parsed.data.plan },
      ...(trialDays ? { trial_period_days: trialDays } : {}),
    },
    allow_promotion_codes: true,
    billing_address_collection: "required",
    tax_id_collection: { enabled: true },
    ...(stripeTaxEnabled()
      ? {
          automatic_tax: { enabled: true },
          customer_update: { address: "auto" as const, name: "auto" as const },
        }
      : {}),
  };
  (sessionParams as Record<string, unknown>).integration_identifier =
    checkoutIntegrationId("billing_checkout");

  const session = await stripe.checkout.sessions.create(sessionParams);

  if (!session.url) {
    return { ok: false, error: "Could not start Checkout. Try again." };
  }
  redirect(session.url);
}

export async function createCustomerPortalSession(): Promise<ActionResult> {
  if (!isStripeConfigured()) {
    return {
      ok: false,
      error: "Billing is not configured yet. Contact support.",
    };
  }

  const { requireActionPermission } = await import("@/lib/auth");
  const authz = await requireActionPermission("settings:manage");
  if (!authz.ok) return authz;
  if (!authz.user.companyId) {
    return { ok: false, error: "Complete onboarding first." };
  }

  const db = getDb();
  const [billing] = await db
    .select({ stripeCustomerId: companyBilling.stripeCustomerId })
    .from(companyBilling)
    .where(eq(companyBilling.companyId, authz.user.companyId))
    .limit(1);

  if (!billing?.stripeCustomerId) {
    return {
      ok: false,
      error: "No billing account yet. Choose a plan first.",
    };
  }

  const stripe = getStripe();
  const base = appBaseUrl();
  const portal = await stripe.billingPortal.sessions.create({
    customer: billing.stripeCustomerId,
    return_url: `${base}/settings/billing`,
  });
  if (!portal.url) {
    return { ok: false, error: "Could not open the billing portal." };
  }
  redirect(portal.url);
}
