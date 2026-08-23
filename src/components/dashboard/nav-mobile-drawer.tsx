"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import type { NavGroup } from "./nav";
import { NavLinks } from "./nav-links";

export function NavMobileDrawer({
  open,
  onClose,
  groups,
  pathname,
  overdueInvoiceCount = 0,
}: {
  open: boolean;
  onClose: () => void;
  groups: NavGroup[];
  pathname: string;
  overdueInvoiceCount?: number;
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
        <div className="flex items-center justify-between px-5 py-5">
          <Link href="/dashboard" onClick={onClose} title="Dot + Dash Accounts">
            <Logo className="text-white" subtitle="Accounts" size={40} />
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="inline-flex items-center justify-center rounded-full p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
          <NavLinks
            groups={groups}
            pathname={pathname}
            collapsed={false}
            overdueInvoiceCount={overdueInvoiceCount}
            onNavigate={onClose}
          />
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
