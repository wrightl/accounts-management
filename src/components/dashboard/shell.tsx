"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { roleLabel, type Role } from "@/lib/roles";
import { NAV_COLLAPSED_COOKIE, type NavGroup } from "./nav";
import { NavLinks } from "./nav-links";
import {
  NavCommandPalette,
  NavSearchTrigger,
  useNavCommandPalette,
} from "./nav-command-palette";
import {
  NavMobileDrawer,
  NavMobileMenuButton,
} from "./nav-mobile-drawer";

function persistNavCollapsed(collapsed: boolean) {
  document.cookie = `${NAV_COLLAPSED_COOKIE}=${collapsed ? "1" : "0"}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function DashboardShell({
  groups,
  role,
  userName,
  navCollapsed: initialNavCollapsed,
  overdueInvoiceCount = 0,
  children,
}: {
  groups: NavGroup[];
  role: Role;
  userName: string | null;
  navCollapsed: boolean;
  overdueInvoiceCount?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(initialNavCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { open: commandOpen, setOpen: setCommandOpen } = useNavCommandPalette();

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
          collapsed ? "w-16" : "w-64",
        )}
      >
        <div
          className={cn(
            "flex overflow-hidden",
            collapsed
              ? "flex-col items-center gap-1.5 px-1 py-5"
              : "items-center gap-1 py-6 pl-5 pr-2",
          )}
        >
          <Link
            href="/dashboard"
            className={cn(
              "flex items-center overflow-hidden",
              collapsed ? "justify-center" : "min-w-0 flex-1",
            )}
            title="Dot + Dash Accounts"
          >
            <Logo
              className="min-w-max text-white"
              subtitle="Accounts"
              size={collapsed ? 32 : 44}
              showWordmark={!collapsed}
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
        <nav
          className={cn(
            "flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto pb-3",
            collapsed ? "px-1.5" : "px-0",
          )}
        >
          <div className="min-h-0 flex-1">
            <NavLinks
              groups={groups}
              pathname={pathname}
              collapsed={collapsed}
              overdueInvoiceCount={overdueInvoiceCount}
              className={collapsed ? undefined : "px-3"}
            />
          </div>
          <div className={cn("shrink-0 pt-2", collapsed ? "px-1.5" : "px-0")}>
            <NavSearchTrigger
              collapsed={collapsed}
              onClick={() => setCommandOpen(true)}
            />
          </div>
        </nav>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between bg-accent px-4 py-3 text-white sm:px-6">
          <div className="flex items-center gap-2 sm:gap-3">
            <NavMobileMenuButton onClick={() => setMobileOpen(true)} />
            <Link href="/dashboard" className="md:hidden">
              <Logo className="text-base text-white" size={32} />
            </Link>
            <div className="hidden text-sm text-white/80 md:block">
              {roleLabel(role)}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <NavSearchTrigger
              collapsed
              onClick={() => setCommandOpen(true)}
              className="hidden text-white/90 hover:bg-white/10 hover:text-white sm:inline-flex md:hidden"
            />
            {userName && <span className="hidden text-sm sm:inline">{userName}</span>}
            <UserButton />
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto px-6 py-8">{children}</main>
      </div>

      <NavMobileDrawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        groups={groups}
        pathname={pathname}
        overdueInvoiceCount={overdueInvoiceCount}
      />

      <NavCommandPalette
        groups={groups}
        open={commandOpen}
        onOpenChange={setCommandOpen}
      />
    </div>
  );
}
