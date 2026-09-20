import type { SessionUser } from "@/lib/auth";
import { can } from "@/lib/roles";

export const MOBILE_RESOURCES = [
  "clients",
  "invoices",
  "quotes",
  "orders",
  "transactions",
  "reimbursements",
  "recurring",
  "spending",
  "reports",
  "dividends",
  "shareholders",
  "settings",
  "users",
] as const;

export type MobileResource = (typeof MOBILE_RESOURCES)[number];

export function isMobileResource(value: string): value is MobileResource {
  return (MOBILE_RESOURCES as readonly string[]).includes(value);
}

export function canAccessResource(
  resource: MobileResource,
  user: SessionUser,
): boolean {
  if (resource === "settings") return can(user.role, "settings:manage");
  if (resource === "users") return can(user.role, "users:manage");
  if (resource === "reports") return can(user.role, "reports:read");
  if (resource === "dividends" || resource === "shareholders") {
    return can(user.role, "accounts:read") && user.entityType !== "sole_trader";
  }
  return can(user.role, "accounts:read");
}
