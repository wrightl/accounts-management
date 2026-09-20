import { isPlatformAdminRole } from "@/lib/roles";

function parseEmailList(value: string | undefined): string[] {
  if (value === undefined) return [];
  return value
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Optional break-glass platform admin emails (`PLATFORM_ADMIN_EMAILS`).
 * These always have portal access regardless of `users.role`.
 * Unset or empty = no overlay (operators come from data migrations / UI).
 */
export function platformAdminEmails(): string[] {
  return parseEmailList(process.env.PLATFORM_ADMIN_EMAILS);
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
