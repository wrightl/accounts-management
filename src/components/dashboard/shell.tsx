"use client";

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
  BarChart3,
  ScrollText,
  ClipboardList,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { roleLabel, type Role } from "@/lib/roles";
import type { NavIcon, NavItem } from "./nav";

const ICONS: Record<NavIcon, LucideIcon> = {
  overview: LayoutDashboard,
  clients: UsersRound,
  invoices: FileText,
  expenses: Receipt,
  reimbursements: Wallet,
  bank: Landmark,
  reports: BarChart3,
  quotes: ScrollText,
  audit: ClipboardList,
  settings: Settings,
  users: Users,
};

export function DashboardShell({
  items,
  role,
  userName,
  children,
}: {
  items: NavItem[];
  role: Role;
  userName: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-full flex-1">
      <aside className="hidden w-64 shrink-0 flex-col bg-navy text-white md:flex">
        <div className="px-5 py-6">
          <Link href="/dashboard" className="block">
            <Logo className="text-white" />
            <span className="mt-1 block pl-7 text-xs tracking-widest text-accent uppercase">
              Accounts
            </span>
          </Link>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
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
                className={cn(
                  "flex items-center gap-3 rounded-full px-3 py-2 text-sm font-normal transition-colors",
                  active
                    ? "bg-white/10 text-brand"
                    : "text-white/70 hover:bg-white/5 hover:text-white",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between bg-accent px-6 py-3 text-white">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="md:hidden">
              <Logo className="text-base text-white" showMark />
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
        <main className="flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
