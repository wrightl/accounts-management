/**
 * Role-based access control for Alfa by Dot+Dash.
 *
 *  - admin:          full access, incl. user & settings management.
 *  - user:           co-founder access to all day-to-day accounting.
 *  - accountant:     external accountant — filing pages and the export, a read-only
 *                    view of what the export contains, and can raise queries, lock
 *                    the books and set opening balances. Cannot change records.
 *  - pending:        signed in, no permissions until an admin assigns a role.
 *  - platform_admin: platform operator — `/platform` only, no tenant.
 */
export const TENANT_ROLES = ["admin", "user", "accountant", "pending"] as const;
export const PLATFORM_ADMIN_ROLE = "platform_admin" as const;
export const ROLES = [...TENANT_ROLES, PLATFORM_ADMIN_ROLE] as const;
export type TenantRole = (typeof TENANT_ROLES)[number];
export type Role = (typeof ROLES)[number];

/** Roles an admin can invite someone as. `pending` grants nothing, so it is not one. */
export const INVITABLE_ROLES = ["user", "accountant", "admin"] as const;

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
  /** Day-to-day records: clients, invoices, expenses, bank rows and so on. */
  | "accounts:read"
  | "accounts:write"
  /** Open the records the accountant pack contains; see lib/accountant/record-scope. */
  | "records:read"
  /** Management figures: safe to pay, profitability, forecast, AI bookkeeper. */
  | "reports:read"
  /** What filing the accounts needs: reports, reserves, director's loans, deadlines, company profile. */
  | "filing:read"
  /** The person's own settings, menu, notifications and help. */
  | "workspace:read"
  | "reports:export"
  | "settings:manage"
  | "users:manage"
  /** Set the "books locked up to" date and the opening balances. */
  | "books:lock"
  /** See accountant query threads and reply to them. */
  | "queries:read"
  /** Raise, close and reopen accountant queries. */
  | "queries:raise";

const PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  admin: new Set<Permission>([
    "accounts:read",
    "accounts:write",
    "records:read",
    "reports:read",
    "filing:read",
    "workspace:read",
    "reports:export",
    "settings:manage",
    "users:manage",
    "books:lock",
    "queries:read",
  ]),
  user: new Set<Permission>([
    "accounts:read",
    "accounts:write",
    "records:read",
    "reports:read",
    "filing:read",
    "workspace:read",
    "reports:export",
    "queries:read",
  ]),
  accountant: new Set<Permission>([
    "records:read",
    "filing:read",
    "workspace:read",
    "reports:export",
    "books:lock",
    "queries:read",
    "queries:raise",
  ]),
  pending: new Set<Permission>(),
  platform_admin: new Set<Permission>(),
};

/** Whether a role is granted a permission. Unknown roles are denied. */
export function can(role: Role | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return PERMISSIONS[role]?.has(permission) ?? false;
}

/** Every permission a role is granted, e.g. for the mobile app to gate its UI. */
export function permissionsFor(role: Role | undefined | null): Permission[] {
  if (!role) return [];
  return [...(PERMISSIONS[role] ?? [])];
}

/**
 * Roles to offer when editing a member. `pending` appears only for someone who
 * already holds it, so the form shows their real role rather than another one.
 */
export function assignableRoles(current: TenantRole): readonly TenantRole[] {
  return current === "pending" ? ["pending", ...INVITABLE_ROLES] : INVITABLE_ROLES;
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
