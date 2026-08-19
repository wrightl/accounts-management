/**
 * Role-based access control for Dot + Dash Accounts.
 *
 * Three roles (see product requirements):
 *  - admin:      full access to everything, incl. user & settings management.
 *  - user:       co-founder access to all day-to-day accounting.
 *  - accountant: external accountant — read-only plus the ability to export.
 */
export const ROLES = ["admin", "user", "accountant"] as const;
export type Role = (typeof ROLES)[number];

export const DEFAULT_ROLE: Role = "user";

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
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
  }
}
