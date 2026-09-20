/**
 * Role-based access control for Alfa by Dot+Dash.
 *
 *  - admin:          full access, incl. user & settings management.
 *  - user:           co-founder access to all day-to-day accounting.
 *  - accountant:     external accountant — read-only plus export.
 *  - pending:        signed in, no permissions until an admin assigns a role.
 *  - platform_admin: platform operator — `/platform` only, no tenant.
 */
export const TENANT_ROLES = ["admin", "user", "accountant", "pending"] as const;
export const PLATFORM_ADMIN_ROLE = "platform_admin" as const;
export const ROLES = [...TENANT_ROLES, PLATFORM_ADMIN_ROLE] as const;
export type TenantRole = (typeof TENANT_ROLES)[number];
export type Role = (typeof ROLES)[number];

/** Assigned on first insert for self-serve sign-up. */
export const DEFAULT_ROLE: TenantRole = "pending";

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function isTenantRole(value: unknown): value is TenantRole {
  return typeof value === "string" && (TENANT_ROLES as readonly string[]).includes(value);
}

export function isPlatformAdminRole(value: unknown): boolean {
  return value === PLATFORM_ADMIN_ROLE;
}

export type Permission =
  | "accounts:read"
  | "accounts:write"
  | "reports:read"
  | "reports:export"
  | "settings:manage"
  | "users:manage";

const PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  admin: new Set<Permission>([
    "accounts:read",
    "accounts:write",
    "reports:read",
    "reports:export",
    "settings:manage",
    "users:manage",
  ]),
  user: new Set<Permission>([
    "accounts:read",
    "accounts:write",
    "reports:read",
    "reports:export",
  ]),
  accountant: new Set<Permission>([
    "accounts:read",
    "reports:read",
    "reports:export",
  ]),
  pending: new Set<Permission>(),
  platform_admin: new Set<Permission>(),
};

/** Whether a role is granted a permission. Unknown roles are denied. */
export function can(role: Role | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return PERMISSIONS[role]?.has(permission) ?? false;
}

/** Human-readable label for a role. */
export function roleLabel(role: Role): string {
  switch (role) {
    case "admin":
      return "Administrator";
    case "user":
      return "Co-founder";
    case "accountant":
      return "Accountant";
    case "pending":
      return "Pending access";
    case "platform_admin":
      return "Platform admin";
  }
}
