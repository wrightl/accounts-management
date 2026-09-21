import "server-only";
import Stripe from "stripe";
import { serverEnv } from "@/env";
import type { BillingInterval, BillingPlan } from "@/db/schema";

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (client) return client;
  const key = serverEnv().STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  client = new Stripe(key, {
    apiVersion: "2026-08-26.dahlia",
    typescript: true,
  });
  return client;
}

export function isStripeConfigured(): boolean {
  const env = serverEnv();
  return Boolean(
    env.STRIPE_SECRET_KEY &&
      env.STRIPE_PRICE_ESSENTIALS_MONTHLY &&
      env.STRIPE_PRICE_ESSENTIALS_YEARLY &&
      env.STRIPE_PRICE_PREMIUM_MONTHLY &&
      env.STRIPE_PRICE_PREMIUM_YEARLY,
  );
}

export function stripePriceId(
  plan: "essentials" | "premium",
  interval: BillingInterval,
): string {
  const env = serverEnv();
  const map = {
    essentials: {
      month: env.STRIPE_PRICE_ESSENTIALS_MONTHLY,
      year: env.STRIPE_PRICE_ESSENTIALS_YEARLY,
    },
    premium: {
      month: env.STRIPE_PRICE_PREMIUM_MONTHLY,
      year: env.STRIPE_PRICE_PREMIUM_YEARLY,
    },
  } as const;
  const id = map[plan][interval];
  if (!id) {
    throw new Error(`Missing Stripe price for ${plan}/${interval}`);
  }
  return id;
}

export function planFromPriceId(
  priceId: string | null | undefined,
): { plan: BillingPlan; interval: BillingInterval } | null {
  if (!priceId) return null;
  const env = serverEnv();
  const pairs: Array<{
    id: string | undefined;
    plan: BillingPlan;
    interval: BillingInterval;
  }> = [
    {
      id: env.STRIPE_PRICE_ESSENTIALS_MONTHLY,
      plan: "essentials",
      interval: "month",
    },
    {
      id: env.STRIPE_PRICE_ESSENTIALS_YEARLY,
      plan: "essentials",
      interval: "year",
    },
    {
      id: env.STRIPE_PRICE_PREMIUM_MONTHLY,
      plan: "premium",
      interval: "month",
    },
    {
      id: env.STRIPE_PRICE_PREMIUM_YEARLY,
      plan: "premium",
      interval: "year",
    },
  ];
  const hit = pairs.find((p) => p.id && p.id === priceId);
  return hit ? { plan: hit.plan, interval: hit.interval } : null;
}

export function appBaseUrl(): string {
  return (
    serverEnv().NODE_ENV === "production"
      ? process.env.NEXT_PUBLIC_APP_URL
      : process.env.NEXT_PUBLIC_APP_URL
  )?.replace(/\/$/, "") || "http://localhost:3001";
}

export function stripeTaxEnabled(): boolean {
  return serverEnv().STRIPE_TAX_ENABLED === "true";
}

/** Random 8-letter suffix for Checkout integration_identifier. */
export function checkoutIntegrationId(label: string): string {
  const suffix = Array.from({ length: 8 }, () =>
    String.fromCharCode(97 + Math.floor(Math.random() * 26)),
  ).join("");
  return `${label}_${suffix}`;
}
