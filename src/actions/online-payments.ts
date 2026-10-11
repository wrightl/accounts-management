"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies } from "@/db/schema";
import { mutate } from "@/lib/mutate";
import { appBaseUrl, getStripe } from "@/lib/billing/stripe";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import type { ActionResult } from "@/actions/result";

function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/**
 * Start (or resume) Stripe onboarding for the company's own Stripe account.
 * The account is Standard-equivalent: full Stripe dashboard, the company pays
 * Stripe's fees and Stripe handles requirements and losses.
 */
export async function startStripeConnectOnboarding(): Promise<ActionResult> {
  if (!stripeConfigured()) {
    return { ok: false, error: "Online payments aren't available yet. Contact support." };
  }
  let onboardingUrl = "";
  const result = await mutate(
    "settings:manage",
    async ({ companyId }) => {
      const company = await getOrCreateCompanySettings(companyId);
      const stripe = getStripe();
      let accountId = company.stripeConnectAccountId;
      if (!accountId) {
        const account = await stripe.accounts.create({
          country: "GB",
          email: company.email ?? undefined,
          business_profile: { name: company.name },
          controller: {
            stripe_dashboard: { type: "full" },
            fees: { payer: "account" },
            losses: { payments: "stripe" },
            requirement_collection: "stripe",
          },
          metadata: { companyId },
        });
        accountId = account.id;
        const db = getDb();
        await db
          .update(companies)
          .set({
            stripeConnectAccountId: accountId,
            stripeConnectChargesEnabled: Boolean(account.charges_enabled),
            updatedAt: new Date(),
          })
          .where(eq(companies.id, companyId));
      }

      const base = appBaseUrl();
      const link = await stripe.accountLinks.create({
        account: accountId,
        type: "account_onboarding",
        refresh_url: `${base}/settings/payments?connect=refresh`,
        return_url: `${base}/settings/payments?connect=return`,
      });
      onboardingUrl = link.url;
      return { ok: true, id: accountId };
    },
    {
      audit: { action: "online_payments.connect_started", entityType: "company" },
      paths: ["/settings/payments"],
    },
  );
  if (!result.ok) return result;
  redirect(onboardingUrl);
}

/**
 * Stop taking online payments. The company keeps its Stripe account; Alfa
 * just forgets it, so pay-now buttons disappear.
 */
export async function disconnectStripeAccount(): Promise<ActionResult> {
  return mutate(
    "settings:manage",
    async ({ companyId }) => {
      const db = getDb();
      await db
        .update(companies)
        .set({
          stripeConnectAccountId: null,
          stripeConnectChargesEnabled: false,
          updatedAt: new Date(),
        })
        .where(eq(companies.id, companyId));
      return { ok: true, id: companyId };
    },
    {
      audit: { action: "online_payments.disconnect", entityType: "company" },
      paths: ["/settings/payments"],
    },
  );
}
