import { isPlatformAdminRole } from "@/lib/roles";

const DEFAULT_PLATFORM_ADMIN_EMAILS = ["admin@dotanddashconsulting.com"];

function parseEmailList(value: string | undefined, fallback: string[]): string[] {
  if (value === undefined) return fallback;
  return value
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Break-glass platform admin emails (`PLATFORM_ADMIN_EMAILS`).
 * These always have portal access regardless of `users.role`.
 * Also used by `npm run db:seed` to provision operator rows + Clerk invites.
 */
export function platformAdminEmails(): string[] {
  return parseEmailList(
    process.env.PLATFORM_ADMIN_EMAILS,
    DEFAULT_PLATFORM_ADMIN_EMAILS,
  );
}

/** Whether an email is on the break-glass platform admin allowlist. */
export function isPlatformAdminEmail(email: string | null | undefined): boolean {
  const normalised = email?.trim().toLowerCase() ?? "";
  if (!normalised) return false;
  return platformAdminEmails().includes(normalised);
}

/**
 * Combined check: `platform_admin` role or env break-glass email.
 * Pure helper for tests and session resolution.
 */
export function resolvePlatformAdmin(params: {
  role?: string | null;
  email: string | null | undefined;
}): boolean {
  return isPlatformAdminRole(params.role) || isPlatformAdminEmail(params.email);
}
