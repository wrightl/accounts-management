import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companyBilling } from "@/db/schema";
import {
  countCompanyMembers,
  getEntitlements,
  type Entitlements,
} from "@/lib/billing/entitlements";
import { ensureCompanyBilling } from "@/lib/billing/company-billing";
import { isStripeConfigured } from "@/lib/billing/stripe";

export type BillingPageData = {
  entitlements: Entitlements;
  userCount: number;
  stripeConfigured: boolean;
  billingInterval: "month" | "year" | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

export async function getBillingPageData(
  companyId: string,
): Promise<BillingPageData> {
  await ensureCompanyBilling(companyId);
  const entitlements = await getEntitlements(companyId);
  const userCount = await countCompanyMembers(companyId);
  const db = getDb();
  const [row] = await db
    .select({
      billingInterval: companyBilling.billingInterval,
      stripeCustomerId: companyBilling.stripeCustomerId,
      stripeSubscriptionId: companyBilling.stripeSubscriptionId,
    })
    .from(companyBilling)
    .where(eq(companyBilling.companyId, companyId))
    .limit(1);

  return {
    entitlements,
    userCount,
    stripeConfigured: isStripeConfigured(),
    billingInterval: row?.billingInterval ?? null,
    stripeCustomerId: row?.stripeCustomerId ?? null,
    stripeSubscriptionId: row?.stripeSubscriptionId ?? null,
  };
}

export type BillingBanner = {
  tone: "info" | "warn" | "danger";
  message: string;
  ctaHref: string;
  ctaLabel: string;
} | null;

export async function getBillingBanner(
  companyId: string,
): Promise<BillingBanner> {
  try {
    await ensureCompanyBilling(companyId);
    const e = await getEntitlements(companyId);
    if (e.complimentary) return null;

    if (e.readOnly) {
      return {
        tone: "danger",
        message:
          e.reason === "trial_expired"
            ? "Your free trial has ended. Choose a plan to keep editing your books."
            : e.reason === "past_due"
              ? "Payment is overdue. Update billing to restore write access."
              : "Your subscription is inactive. Choose a plan to restore write access.",
        ctaHref: "/settings/billing",
        ctaLabel: "Choose a plan",
      };
    }

    if (e.status === "past_due") {
      return {
        tone: "warn",
        message:
          "We could not take payment. Update your card to avoid losing write access.",
        ctaHref: "/settings/billing",
        ctaLabel: "Update billing",
      };
    }

    if (e.status === "trialing" && e.trialEndsAt) {
      const days = Math.ceil(
        (e.trialEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
      );
      if (days <= 7) {
        return {
          tone: days <= 3 ? "warn" : "info",
          message:
            days <= 0
              ? "Your trial ends today. Choose a plan to keep writing."
              : `Your free trial ends in ${days} day${days === 1 ? "" : "s"}.`,
          ctaHref: "/settings/billing",
          ctaLabel: "Choose a plan",
        };
      }
    }

    if (e.cancelAtPeriodEnd && e.currentPeriodEnd) {
      return {
        tone: "warn",
        message: `Your subscription cancels on ${e.currentPeriodEnd.toLocaleDateString("en-GB")}.`,
        ctaHref: "/settings/billing",
        ctaLabel: "Manage billing",
      };
    }

    return null;
  } catch {
    return null;
  }
}
