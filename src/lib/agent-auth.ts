/**
 * Pure helpers for the local `npm run auth:agent` CLI.
 * Kept free of `server-only` so unit tests can import them.
 */

export type FounderCandidate = {
  email: string;
  clerkUserId: string | null;
  role: string;
  companyId: string | null;
};

const DEFAULT_APP_ORIGIN = "http://localhost:3001";
const DEFAULT_REDIRECT_PATH = "/dashboard";

/** Refuse live Clerk secrets and hosted production runtimes. */
export function assertAgentAuthAllowed(env: {
  clerkSecretKey?: string | null;
  nodeEnv?: string | null;
  vercel?: string | null;
  vercelEnv?: string | null;
}): void {
  const secret = env.clerkSecretKey?.trim() ?? "";
  if (secret.startsWith("sk_live_")) {
    throw new Error(
      "auth:agent refused: live Clerk secret key. Use a development (sk_test_) instance only.",
    );
  }
  if (env.nodeEnv === "production") {
    throw new Error(
      "auth:agent refused: NODE_ENV=production. Run locally against a development Clerk instance.",
    );
  }
  if (env.vercel || env.vercelEnv) {
    throw new Error(
      "auth:agent refused: Vercel environment detected. This script is local-dev only.",
    );
  }
}

/**
 * Pick the first tenant founder (admin/user with company + Clerk id).
 * Never returns platform_admin or users without a company.
 */
export function pickFounder(
  candidates: FounderCandidate[],
  emailOverride?: string | null,
): FounderCandidate {
  const founders = candidates.filter(
    (u) =>
      (u.role === "admin" || u.role === "user") &&
      u.companyId != null &&
      Boolean(u.clerkUserId?.trim()),
  );

  if (emailOverride?.trim()) {
    const normalised = emailOverride.trim().toLowerCase();
    const match = founders.find((u) => u.email.toLowerCase() === normalised);
    if (!match) {
      throw new Error(
        `No tenant founder found for ${emailOverride}. Need role admin/user, a company, and a linked Clerk user.`,
      );
    }
    return match;
  }

  const first = founders[0];
  if (!first) {
    throw new Error(
      "No tenant founder found. Need a local user with role admin/user, company_id set, and clerk_user_id set.",
    );
  }
  return first;
}

/** Join a path (or absolute URL) onto the local app origin. */
export function resolveRedirectUrl(
  redirectArg: string | null | undefined,
  appOrigin = DEFAULT_APP_ORIGIN,
): string {
  const origin = appOrigin.replace(/\/$/, "") || DEFAULT_APP_ORIGIN;
  const raw = redirectArg?.trim() || DEFAULT_REDIRECT_PATH;
  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return `${origin}${path}`;
}

export function ticketSignInUrl(
  token: string,
  appOrigin = DEFAULT_APP_ORIGIN,
): string {
  const origin = appOrigin.replace(/\/$/, "") || DEFAULT_APP_ORIGIN;
  return `${origin}/sign-in?__clerk_ticket=${encodeURIComponent(token)}`;
}
