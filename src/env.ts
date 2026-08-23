import { z } from "zod";

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

  // Email (Resend). Provider is pluggable — see src/lib/email.
  EMAIL_PROVIDER: z.enum(["resend", "console"]).default("console"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Dot + Dash Accounts <accounts@dotanddashconsulting.com>"),

  // Cron / automation. Routes refuse to run until CRON_SECRET is set.
  CRON_SECRET: z.string().optional(),
  RECURRING_INVOICES_ENABLED: z.enum(["true", "false"]).optional(),

  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const clientSchema = z.object({
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
});

type ServerEnv = z.infer<typeof serverSchema>;
type ClientEnv = z.infer<typeof clientSchema>;

let cachedServer: ServerEnv | null = null;

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
});

/** Whether Clerk credentials are present (both public and secret keys). */
export function isAuthConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
      process.env.CLERK_SECRET_KEY,
  );
}

/** Whether a database connection string is available. */
export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** A required server value, throwing a clear error when absent. */
export function requireEnv(key: keyof ServerEnv): string {
  const value = serverEnv()[key];
  if (value === undefined || value === null || value === "") {
    throw new Error(`Missing required environment variable: ${String(key)}`);
  }
  return String(value);
}
