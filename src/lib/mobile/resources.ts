import type { SessionUser } from "@/lib/auth";
import { can } from "@/lib/roles";

/**
 * Read-only lists the app shows. Everything else is left to the web, which
 * the app links to.
 */
export const MOBILE_RESOURCES = [
  "clients",
  "invoices",
  "quotes",
  "reimbursements",
  "spending",
  "dividends",
] as const;

export type MobileResource = (typeof MOBILE_RESOURCES)[number];

export function isMobileResource(value: string): value is MobileResource {
  return (MOBILE_RESOURCES as readonly string[]).includes(value);
}

export function canAccessResource(
  resource: MobileResource,
  user: SessionUser,
): boolean {
  if (resource === "dividends") {
    return can(user.role, "accounts:read") && user.entityType !== "sole_trader";
  }
  return can(user.role, "accounts:read");
}
