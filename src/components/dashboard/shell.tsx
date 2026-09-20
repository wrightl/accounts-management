"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/roles";
import { CompanyNavBrand, type CompanySwitcherOption } from "./company-nav-brand";
import { NAV_COLLAPSED_COOKIE, type NavGroup } from "./nav";
import { NavHelpLink, NavLinks } from "./nav-links";
import {
  NavCommandPalette,
  NavSearchTrigger,
  useNavCommandPalette,
} from "./nav-command-palette";
import {
  NavMobileDrawer,
  NavMobileMenuButton,
} from "./nav-mobile-drawer";
import { NavUserProfile } from "./nav-user-profile";

function persistNavCollapsed(collapsed: boolean) {
  document.cookie = `${NAV_COLLAPSED_COOKIE}=${collapsed ? "1" : "0"}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function DashboardShell({
  groups,
  role,
  userName,
  avatarUrl,
  companyId,
  companyName,
  companyLogoUrl,
  memberships = [],
  navCollapsed: initialNavCollapsed,
  overdueInvoiceCount = 0,
  showPlatformLink = false,
  maintenanceBanner = null,
  suspendedReason = null,
  children,
}: {
  groups: NavGroup[];
  role: Role;
  userName: string | null;
  avatarUrl: string | null;
  companyId: string;
  companyName: string;
  companyLogoUrl: string | null;
  memberships?: CompanySwitcherOption[];
  navCollapsed: boolean;
  overdueInvoiceCount?: number;
  showPlatformLink?: boolean;
  maintenanceBanner?: string | null;
  suspendedReason?: string | null;
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
          <CompanyNavBrand
            companyName={companyName}
            logoUrl={companyLogoUrl}
            companyId={companyId}
            memberships={memberships}
            collapsed={collapsed}
          />
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
            "flex min-h-0 flex-1 flex-col overflow-hidden pb-3",
            collapsed ? "px-1.5" : "px-0",
          )}
        >
          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
            <NavLinks
              groups={groups}
              pathname={pathname}
              collapsed={collapsed}
              overdueInvoiceCount={overdueInvoiceCount}
              className={collapsed ? undefined : "px-3"}
            />
          </div>
          <div className={cn("shrink-0 pt-2", collapsed ? "px-1.5" : "px-0")}>
            <div
              className={cn(
                "flex items-center",
                collapsed ? "flex-col" : "mx-3 gap-0.5",
              )}
            >
              <NavSearchTrigger
                collapsed={collapsed}
                onClick={() => setCommandOpen(true)}
                className={collapsed ? undefined : "mx-0 w-auto flex-1"}
              />
              <NavHelpLink collapsed={collapsed} pathname={pathname} />
            </div>
            {showPlatformLink ? (
              <Link
                href="/platform"
                title="Platform"
                className={cn(
                  "mt-1 flex items-center rounded-full text-sm text-white/70 transition-colors hover:bg-white/5 hover:text-white",
                  collapsed ? "justify-center py-2" : "mx-3 px-3 py-2",
                )}
              >
                {collapsed ? "P" : "Platform"}
              </Link>
            ) : null}
            <NavUserProfile
              collapsed={collapsed}
              role={role}
              userName={userName}
              avatarUrl={avatarUrl}
              active={pathname === "/profile"}
            />
          </div>
        </nav>
      </aside>

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <NavMobileMenuButton
          onClick={() => setMobileOpen(true)}
          className="absolute left-4 top-4 z-10 bg-navy text-white shadow-sm hover:bg-navy/90"
        />
        {(maintenanceBanner || suspendedReason) && (
          <div className="shrink-0 space-y-0 border-b border-border">
            {maintenanceBanner ? (
              <div className="bg-amber-50 px-6 py-2 text-sm text-amber-950">
                {maintenanceBanner}
              </div>
            ) : null}
            {suspendedReason ? (
              <div className="bg-red-50 px-6 py-2 text-sm text-red-900">
                {suspendedReason}
              </div>
            ) : null}
          </div>
        )}
        <main className="min-h-0 flex-1 overflow-y-auto px-6 py-8 pt-16 md:pt-8">
          {children}
        </main>
      </div>

      <NavMobileDrawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        groups={groups}
        pathname={pathname}
        overdueInvoiceCount={overdueInvoiceCount}
        role={role}
        userName={userName}
        avatarUrl={avatarUrl}
        companyName={companyName}
        companyLogoUrl={companyLogoUrl}
        companyId={companyId}
        memberships={memberships}
        showPlatformLink={showPlatformLink}
        onSearch={() => {
          setMobileOpen(false);
          setCommandOpen(true);
        }}
      />

      <NavCommandPalette
        groups={groups}
        open={commandOpen}
        onOpenChange={setCommandOpen}
      />
    </div>
  );
}
