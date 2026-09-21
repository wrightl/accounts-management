export type PlatformNavItem = {
  href: string;
  label: string;
};

export const PLATFORM_NAV: PlatformNavItem[] = [
  { href: "/platform", label: "Overview" },
  { href: "/platform/companies", label: "Companies" },
  { href: "/platform/billing", label: "Billing" },
  { href: "/platform/users", label: "Users" },
  { href: "/platform/activity", label: "Activity" },
  { href: "/platform/logs", label: "Logs" },
  { href: "/platform/jobs", label: "Jobs" },
  { href: "/platform/settings", label: "Settings" },
  { href: "/platform/health", label: "Health" },
];
