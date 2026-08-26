"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import Link from "next/link";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { switchCompany } from "@/actions/users";

export type CompanySwitcherOption = {
  companyId: string;
  companyName: string;
  logoUrl: string | null;
};

function CompanyAvatar({
  companyName,
  logoUrl,
  size,
}: {
  companyName: string;
  logoUrl: string | null;
  size: "sm" | "md";
}) {
  const logoSrc = logoUrl
    ? `/api/company/logo?v=${encodeURIComponent(logoUrl)}`
    : null;
  const dim = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const text = size === "sm" ? "text-sm" : "text-base";

  if (logoSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- private storage preview
      <img
        src={logoSrc}
        alt=""
        className={cn(
          "shrink-0 rounded-md bg-white object-contain p-0.5",
          dim,
        )}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md bg-white/15 font-display font-semibold text-white",
        dim,
        text,
      )}
    >
      {companyName.trim().charAt(0).toUpperCase() || "A"}
    </span>
  );
}

export function CompanyNavBrand({
  companyName,
  logoUrl,
  companyId,
  memberships = [],
  collapsed = false,
  onNavigate,
  className,
}: {
  companyName: string;
  logoUrl: string | null;
  companyId?: string;
  memberships?: CompanySwitcherOption[];
  collapsed?: boolean;
  onNavigate?: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const canSwitch = memberships.length > 1 && Boolean(companyId);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!canSwitch) {
    return (
      <Link
        href="/dashboard"
        onClick={onNavigate}
        title={companyName}
        className={cn(
          "flex min-w-0 items-center gap-2.5 overflow-hidden text-white",
          collapsed ? "justify-center" : "flex-1",
          className,
        )}
      >
        <CompanyAvatar
          companyName={companyName}
          logoUrl={logoUrl}
          size={collapsed ? "sm" : "md"}
        />
        {!collapsed ? (
          <span className="min-w-0 truncate font-display text-base font-semibold leading-tight tracking-tight">
            {companyName}
          </span>
        ) : null}
      </Link>
    );
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative min-w-0",
        collapsed ? "" : "flex-1",
        className,
      )}
    >
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Switch company (current: ${companyName})`}
        disabled={pending}
        onClick={() => setOpen((value) => !value)}
        title={companyName}
        className={cn(
          "flex w-full min-w-0 items-center gap-2.5 overflow-hidden rounded-md text-left text-white",
          "hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
          collapsed ? "justify-center p-1" : "px-1 py-1",
          pending && "opacity-70",
        )}
      >
        <CompanyAvatar
          companyName={companyName}
          logoUrl={logoUrl}
          size={collapsed ? "sm" : "md"}
        />
        {!collapsed ? (
          <>
            <span className="min-w-0 flex-1 truncate font-display text-base font-semibold leading-tight tracking-tight">
              {companyName}
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 opacity-70 transition-transform",
                open && "rotate-180",
              )}
              aria-hidden
            />
          </>
        ) : null}
      </button>

      {open ? (
        <ul
          role="listbox"
          aria-label="Companies"
          className={cn(
            "absolute z-50 mt-1 max-h-64 overflow-auto rounded-md border border-white/15 bg-navy py-1 shadow-xl",
            collapsed
              ? "left-0 w-56"
              : "left-0 right-0 min-w-[12rem]",
          )}
        >
          {memberships.map((option) => {
            const selected = option.companyId === companyId;
            return (
              <li key={option.companyId} role="option" aria-selected={selected}>
                <button
                  type="button"
                  disabled={pending || selected}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-white",
                    "hover:bg-white/10 disabled:cursor-default",
                    selected && "bg-white/10",
                  )}
                  onClick={() => {
                    if (selected) {
                      setOpen(false);
                      return;
                    }
                    startTransition(async () => {
                      setOpen(false);
                      onNavigate?.();
                      await switchCompany(option.companyId);
                    });
                  }}
                >
                  <CompanyAvatar
                    companyName={option.companyName}
                    logoUrl={option.logoUrl}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {option.companyName}
                  </span>
                  {selected ? (
                    <Check className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
