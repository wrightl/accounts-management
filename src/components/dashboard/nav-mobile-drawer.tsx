"use client";

import { useEffect } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/roles";
import type { NavGroup } from "./nav";
import {
  CompanyNavBrand,
  type CompanySwitcherOption,
} from "./company-nav-brand";
import { NavLinks } from "./nav-links";
import { NavSearchTrigger } from "./nav-command-palette";
import { NavUserProfile } from "./nav-user-profile";

export function NavMobileDrawer({
  open,
  onClose,
  groups,
  pathname,
  overdueInvoiceCount = 0,
  role,
  userName,
  avatarUrl,
  companyId,
  companyName,
  companyLogoUrl,
  memberships = [],
  onSearch,
}: {
  open: boolean;
  onClose: () => void;
  groups: NavGroup[];
  pathname: string;
  overdueInvoiceCount?: number;
  role: Role;
  userName: string | null;
  avatarUrl: string | null;
  companyId: string;
  companyName: string;
  companyLogoUrl: string | null;
  memberships?: CompanySwitcherOption[];
  onSearch: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <button
        type="button"
        className="absolute inset-0 bg-navy/50 backdrop-blur-sm"
        aria-label="Close navigation"
        onClick={onClose}
      />
      <aside
        className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-navy text-white shadow-xl transition-transform duration-200 ease-out"
        aria-label="Mobile navigation"
      >
        <div className="flex items-center justify-between gap-2 px-5 py-5">
          <CompanyNavBrand
            companyName={companyName}
            logoUrl={companyLogoUrl}
            companyId={companyId}
            memberships={memberships}
            onNavigate={onClose}
            className="min-w-0 flex-1"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="inline-flex shrink-0 items-center justify-center rounded-full p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex min-h-0 flex-1 flex-col overflow-hidden pb-4">
          <div className="min-h-0 flex-1 overflow-y-auto px-3">
            <NavLinks
              groups={groups}
              pathname={pathname}
              collapsed={false}
              overdueInvoiceCount={overdueInvoiceCount}
              onNavigate={onClose}
            />
          </div>
          <div className="shrink-0 pt-2">
            <NavSearchTrigger collapsed={false} onClick={onSearch} />
            <NavUserProfile
              collapsed={false}
              role={role}
              userName={userName}
              avatarUrl={avatarUrl}
              active={pathname === "/profile"}
              onNavigate={onClose}
            />
          </div>
        </nav>
      </aside>
    </div>
  );
}

export function NavMobileMenuButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open navigation"
      className={cn(
        "inline-flex items-center justify-center rounded-full p-2 text-white/90 transition-colors hover:bg-white/10 hover:text-white md:hidden",
        className,
      )}
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}
