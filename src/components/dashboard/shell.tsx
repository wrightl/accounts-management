"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
  LayoutDashboard,
  UsersRound,
  FileText,
  Receipt,
  Wallet,
  Landmark,
  PieChart,
  BarChart3,
  ScrollText,
  ClipboardList,
  Settings,
  Users,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { roleLabel, type Role } from "@/lib/roles";
import { NAV_COLLAPSED_COOKIE, type NavIcon, type NavItem } from "./nav";

const ICONS: Record<NavIcon, LucideIcon> = {
  overview: LayoutDashboard,
  clients: UsersRound,
  invoices: FileText,
  expenses: Receipt,
  reimbursements: Wallet,
  bank: Landmark,
  spending: PieChart,
  reports: BarChart3,
  quotes: ScrollText,
  audit: ClipboardList,
  settings: Settings,
  users: Users,
};

function persistNavCollapsed(collapsed: boolean) {
  document.cookie = `${NAV_COLLAPSED_COOKIE}=${collapsed ? "1" : "0"}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

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
        collapsed ? "opacity-0" : "opacity-100",
      )}
    >
      {children}
    </span>
  );
}

export function DashboardShell({
  items,
  role,
  userName,
  navCollapsed: initialNavCollapsed,
  children,
}: {
  items: NavItem[];
  role: Role;
  userName: string | null;
  navCollapsed: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(initialNavCollapsed);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      persistNavCollapsed(next);
      return next;
    });
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      <aside
        id="dashboard-nav"
        className={cn(
          "hidden h-full shrink-0 flex-col overflow-hidden bg-navy text-white md:flex",
          "transition-[width] duration-200 ease-out",
          collapsed ? "w-24" : "w-64",
        )}
      >
        <div className="flex items-center gap-1 overflow-hidden py-6 pl-5 pr-2">
          <Link
            href="/dashboard"
            className="flex min-w-0 flex-1 items-center overflow-hidden"
            title="Dot + Dash Accounts"
          >
            <Logo
              className="min-w-max text-white"
              subtitle="Accounts"
              size={44}
            />
          </Link>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-controls="dashboard-nav"
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            title={collapsed ? "Expand navigation" : "Collapse navigation"}
            className="inline-flex shrink-0 items-center justify-center rounded-full p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>
        <nav className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 pb-6">
          {items.map((item) => {
            const Icon = ICONS[item.icon];
            const active =
              item.href === "/dashboard"
                ? pathname === item.href
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={cn(
                  "flex items-center gap-3 overflow-hidden rounded-full px-3 py-2 text-sm font-normal transition-colors",
                  active
                    ? "bg-white/10 text-brand"
                    : "text-white/70 hover:bg-white/5 hover:text-white",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <NavLabel collapsed={collapsed}>{item.label}</NavLabel>
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between bg-accent px-6 py-3 text-white">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="md:hidden">
              <Logo className="text-base text-white" size={32} />
            </Link>
            <div className="hidden text-sm text-white/80 md:block">
              {roleLabel(role)}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {userName && <span className="text-sm">{userName}</span>}
            <UserButton />
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
