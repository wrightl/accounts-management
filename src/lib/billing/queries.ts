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
import { isStripeConfigured, getStripeCatalog } from "@/lib/billing/catalog";
import type { StripeCatalog } from "@/lib/billing/catalog-types";
import { getStripe } from "@/lib/billing/stripe";

export type BillingPaymentMethodSummary = {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
} | null;

export type BillingInvoiceRow = {
  id: string;
  number: string | null;
  status: string | null;
  amountPaid: number;
  amountDue: number;
  currency: string;
  created: number;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
};

export type BillingPageData = {
  entitlements: Entitlements;
  userCount: number;
  stripeConfigured: boolean;
  billingInterval: "month" | "year" | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  catalog: StripeCatalog | null;
  paymentMethod: BillingPaymentMethodSummary;
  invoices: BillingInvoiceRow[];
};

async function loadStripeBillingExtras(args: {
  customerId: string;
  subscriptionId: string | null;
}): Promise<{
  paymentMethod: BillingPaymentMethodSummary;
  invoices: BillingInvoiceRow[];
}> {
  try {
    const stripe = getStripe();
    const [customer, invoicesResult] = await Promise.all([
      stripe.customers.retrieve(args.customerId, {
        expand: ["invoice_settings.default_payment_method"],
      }),
      stripe.invoices.list({ customer: args.customerId, limit: 12 }),
    ]);

    let paymentMethod: BillingPaymentMethodSummary = null;

    if (!("deleted" in customer && customer.deleted)) {
      const defaultPm = customer.invoice_settings?.default_payment_method;
      let pmId: string | null = null;
      if (typeof defaultPm === "string") {
        pmId = defaultPm;
      } else if (defaultPm && typeof defaultPm === "object" && "card" in defaultPm) {
        const card = defaultPm.card;
        if (card) {
          paymentMethod = {
            brand: card.brand ?? "card",
            last4: card.last4 ?? "????",
            expMonth: card.exp_month ?? 0,
            expYear: card.exp_year ?? 0,
          };
        }
      }

      if (!paymentMethod && args.subscriptionId) {
        try {
          const sub = await stripe.subscriptions.retrieve(args.subscriptionId, {
            expand: ["default_payment_method"],
          });
          const subPm = sub.default_payment_method;
          if (subPm && typeof subPm === "object" && "card" in subPm && subPm.card) {
            paymentMethod = {
              brand: subPm.card.brand ?? "card",
              last4: subPm.card.last4 ?? "????",
              expMonth: subPm.card.exp_month ?? 0,
              expYear: subPm.card.exp_year ?? 0,
            };
          } else if (typeof subPm === "string") {
            pmId = subPm;
          }
        } catch {
          /* ignore */
        }
      }

      if (!paymentMethod && pmId) {
        const pm = await stripe.paymentMethods.retrieve(pmId);
        if (pm.card) {
          paymentMethod = {
            brand: pm.card.brand ?? "card",
            last4: pm.card.last4 ?? "????",
            expMonth: pm.card.exp_month ?? 0,
            expYear: pm.card.exp_year ?? 0,
          };
        }
      }
    }

    const invoices: BillingInvoiceRow[] = invoicesResult.data.map((inv) => ({
      id: inv.id,
      number: inv.number,
      status: inv.status,
      amountPaid: inv.amount_paid ?? 0,
      amountDue: inv.amount_due ?? 0,
      currency: inv.currency ?? "gbp",
      created: inv.created,
      hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
      invoicePdf: inv.invoice_pdf ?? null,
    }));

    return { paymentMethod, invoices };
  } catch {
    return { paymentMethod: null, invoices: [] };
  }
}

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

  const [stripeConfigured, catalog] = await Promise.all([
    isStripeConfigured(),
    getStripeCatalog(),
  ]);

  const customerId = row?.stripeCustomerId ?? null;
  const subscriptionId = row?.stripeSubscriptionId ?? null;
  const extras =
    customerId && stripeConfigured
      ? await loadStripeBillingExtras({
          customerId,
          subscriptionId,
        })
      : { paymentMethod: null, invoices: [] };

  return {
    entitlements,
    userCount,
    stripeConfigured,
    billingInterval: row?.billingInterval ?? null,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    catalog,
    paymentMethod: extras.paymentMethod,
    invoices: extras.invoices,
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
