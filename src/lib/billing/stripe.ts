import "server-only";
import Stripe from "stripe";
import { serverEnv } from "@/env";

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
