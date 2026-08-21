import type { Permission } from "@/lib/roles";

export type NavIcon =
  | "overview"
  | "invoices"
  | "expenses"
  | "reimbursements"
  | "reports"
  | "settings"
  | "users";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  permission: Permission;
  /** Phase the section is planned for (shown as a badge in stubs). */
  phase?: number;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: "overview", permission: "accounts:read" },
  { href: "/dashboard/invoices", label: "Invoices", icon: "invoices", permission: "accounts:read", phase: 1 },
  { href: "/dashboard/expenses", label: "Expenses", icon: "expenses", permission: "accounts:read", phase: 2 },
  { href: "/dashboard/reimbursements", label: "Reimbursements", icon: "reimbursements", permission: "accounts:read", phase: 3 },
  { href: "/dashboard/reports", label: "Reports", icon: "reports", permission: "reports:read", phase: 5 },
  { href: "/dashboard/settings", label: "Settings", icon: "settings", permission: "settings:manage" },
  { href: "/dashboard/users", label: "Users", icon: "users", permission: "users:manage" },
];
