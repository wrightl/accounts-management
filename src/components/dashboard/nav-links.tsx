"use client";

import Link from "next/link";
import {
  LayoutDashboard,
  UsersRound,
  FileText,
  Receipt,
  Wallet,
  Landmark,
  PieChart,
  BarChart3,
  Coins,
  BadgePercent,
  ScrollText,
  ClipboardList,
  Mail,
  Package,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavGroup, NavIcon, NavItem } from "./nav";

export const NAV_ICONS: Record<NavIcon, LucideIcon> = {
  overview: LayoutDashboard,
  clients: UsersRound,
  invoices: FileText,
  expenses: Receipt,
  reimbursements: Wallet,
  bank: Landmark,
  spending: PieChart,
  reports: BarChart3,
  dividends: Coins,
  shareholders: BadgePercent,
  quotes: ScrollText,
  orders: Package,
  audit: ClipboardList,
  inboundEmail: Mail,
  settings: Settings,
  users: Users,
};

function NavLabel({
  collapsed,
  children,
}: {
  collapsed: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "whitespace-nowrap transition-opacity duration-200 ease-out",
        collapsed ? "w-0 overflow-hidden opacity-0" : "opacity-100",
      )}
    >
      {children}
    </span>
  );
}

function isNavItemActive(pathname: string, href: string): boolean {
  return href === "/dashboard"
    ? pathname === href
    : pathname.startsWith(href);
}

function NavLink({
  item,
  pathname,
  collapsed,
  overdueInvoiceCount,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  overdueInvoiceCount: number;
  onNavigate?: () => void;
}) {
  const Icon = NAV_ICONS[item.icon];
  const active = isNavItemActive(pathname, item.href);
  const showOverdueBadge =
    item.href === "/dashboard/invoices" && overdueInvoiceCount > 0;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={
        showOverdueBadge
          ? `${item.label} (${overdueInvoiceCount} overdue)`
          : item.label
      }
      className={cn(
        "flex items-center overflow-hidden rounded-full py-2 text-sm font-normal transition-colors",
        collapsed ? "justify-center px-0" : "gap-3 px-3",
        active
          ? "bg-white/10 text-brand"
          : "text-white/70 hover:bg-white/5 hover:text-white",
      )}
    >
      <span className="relative shrink-0">
        <Icon className="h-4 w-4" />
        {showOverdueBadge && collapsed ? (
          <span
            className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-brand"
            aria-hidden
          />
        ) : null}
      </span>
      <NavLabel collapsed={collapsed}>{item.label}</NavLabel>
      {showOverdueBadge && !collapsed ? (
        <span className="ml-auto shrink-0 rounded-full bg-brand px-1.5 py-0.5 text-xs font-medium tabular-nums text-navy">
          {overdueInvoiceCount}
        </span>
      ) : null}
    </Link>
  );
}

export function NavLinks({
  groups,
  pathname,
  collapsed,
  overdueInvoiceCount = 0,
  onNavigate,
  className,
}: {
  groups: NavGroup[];
  pathname: string;
  collapsed: boolean;
  overdueInvoiceCount?: number;
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <div className={className}>
      {groups.map((group, groupIndex) => (
        <div
          key={group.id}
          className={cn(groupIndex > 0 && (collapsed ? "mt-1" : "mt-3"))}
        >
          {groupIndex > 0 && collapsed ? (
            <div
              className="mx-auto mb-1 h-px w-6 bg-white/15"
              aria-hidden
            />
          ) : null}
          {group.label && !collapsed ? (
            <p className="mb-1 px-3 text-xs font-medium uppercase tracking-wide text-white/40">
              {group.label}
            </p>
          ) : null}
          {group.items.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              pathname={pathname}
              collapsed={collapsed}
              overdueInvoiceCount={overdueInvoiceCount}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export { isNavItemActive };
