import { z } from "zod";
import { PRODUCT_LOCKUP } from "@/lib/product";

/**
 * Centralised, typed access to environment variables.
 *
 * Validation is intentionally *lazy*: importing this module never throws, so
 * the app can build and run public pages / tests before every secret is set.
 * Call {@link serverEnv} where a value is actually required at request time,
 * and it will throw a clear error if the variable is missing.
 */
const serverSchema = z.object({
  // Database (Neon). Pooled URL for the app, unpooled for migrations.
  DATABASE_URL: z.string().url().optional(),
  DATABASE_URL_UNPOOLED: z.string().url().optional(),

  // Clerk authentication.
  CLERK_SECRET_KEY: z.string().optional(),

  // File storage (Vercel Blob).
  BLOB_READ_WRITE_TOKEN: z.string().optional(),

  // AI Gateway (optional — required when receipt OCR provider is ai_gateway).
  AI_GATEWAY_API_KEY: z.string().optional(),

  // Email (Resend). Provider is pluggable — see src/lib/email.
  EMAIL_PROVIDER: z.enum(["resend", "console"]).default("console"),
  RESEND_API_KEY: z.string().optional(),
  RESEND_WEBHOOK_SECRET: z.string().optional(),
  EMAIL_FROM: z.string().default(`${PRODUCT_LOCKUP} <accounts@dotanddashconsulting.com>`),
  /** Domain that receives inbound expense emails (Resend Receiving). */
  EXPENSE_INBOUND_DOMAIN: z.string().default("dotanddashconsulting.com"),
  /** Local-part prefix for per-user plus-addresses, e.g. expenses+company.user@domain. */
  EXPENSE_INBOUND_PREFIX: z.string().default("expenses"),

  // Stripe Billing (manual keys — not Vercel Marketplace).
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_ESSENTIALS_MONTHLY: z.string().optional(),
  STRIPE_PRICE_ESSENTIALS_YEARLY: z.string().optional(),
  STRIPE_PRICE_PREMIUM_MONTHLY: z.string().optional(),
  STRIPE_PRICE_PREMIUM_YEARLY: z.string().optional(),
  /** When "true", Checkout uses automatic_tax (requires UK VAT registration in Stripe). */
  STRIPE_TAX_ENABLED: z.enum(["true", "false"]).optional(),

  // Cron / automation. Routes refuse to run until CRON_SECRET is set.
  CRON_SECRET: z.string().optional(),

  // Optional break-glass /platform emails (comma-separated). Unset = none.
  PLATFORM_ADMIN_EMAILS: z.string().optional(),

  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const clientSchema = z.object({
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
});

type ServerEnv = z.infer<typeof serverSchema>;
type ClientEnv = z.infer<typeof clientSchema>;

let cachedServer: ServerEnv | null = null;

/** Test helper — clear the lazy env cache after mutating process.env. */
export function resetServerEnvCache() {
  cachedServer = null;
}

export function serverEnv(): ServerEnv {
  if (cachedServer) return cachedServer;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid server environment: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`,
    );
  }
  cachedServer = parsed.data;
  return cachedServer;
}

export const clientEnv: ClientEnv = clientSchema.parse({
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
});

/** A required server value, throwing a clear error when absent. */
export function requireEnv(key: keyof ServerEnv): string {
  const value = serverEnv()[key];
  if (value === undefined || value === null || value === "") {
    throw new Error(`Missing required environment variable: ${String(key)}`);
  }
  return String(value);
}
