import { DEFAULT_ROLE, type Role } from "@/lib/roles";

const DEFAULT_ADMIN_EMAILS = ["lee@dotanddashconsulting.com"];
const DEFAULT_USER_EMAILS = ["angel@dotanddashconsulting.com"];

function parseEmailList(value: string | undefined, fallback: string[]): string[] {
  if (value === undefined) return fallback;
  return value
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Bootstrap admin emails (`BOOTSTRAP_ADMIN_EMAILS`, comma-separated). */
export function bootstrapAdminEmails(): string[] {
  return parseEmailList(process.env.BOOTSTRAP_ADMIN_EMAILS, DEFAULT_ADMIN_EMAILS);
}

/** Bootstrap co-founder emails (`BOOTSTRAP_USER_EMAILS`, comma-separated). */
export function bootstrapUserEmails(): string[] {
  return parseEmailList(process.env.BOOTSTRAP_USER_EMAILS, DEFAULT_USER_EMAILS);
}

/** First-insert only. After that, role is assigned in the Users page. */
export function bootstrapRole(email: string | null): Role {
  const normalised = email?.trim().toLowerCase() ?? "";
  if (normalised && bootstrapAdminEmails().includes(normalised)) return "admin";
  if (normalised && bootstrapUserEmails().includes(normalised)) return "user";
  return DEFAULT_ROLE;
}
