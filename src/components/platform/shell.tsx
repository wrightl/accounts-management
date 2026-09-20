"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { PLATFORM_NAV } from "./nav";

function userInitials(userName: string | null): string {
  if (!userName) return "?";
  const parts = userName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

export function PlatformShell({
  userName,
  avatarUrl,
  children,
}: {
  userName: string | null;
  avatarUrl?: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const profileActive =
    pathname === "/platform/profile" || pathname.startsWith("/platform/profile/");

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-wash md:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-white/10 bg-slate-900 text-white md:h-full md:w-56 md:border-b-0 md:border-r">
        <div className="shrink-0 px-5 py-5">
          <p className="font-display text-lg font-semibold tracking-tight">
            Platform
          </p>
          <p className="mt-0.5 text-xs text-white/50">Alfa ops</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:min-h-0 md:flex-1 md:flex-col md:overflow-y-auto">
          {PLATFORM_NAV.map((item) => {
            const active =
              item.href === "/platform"
                ? pathname === "/platform"
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-white/15 text-white"
                    : "text-white/70 hover:bg-white/10 hover:text-white",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="shrink-0 border-t border-white/10 px-3 py-3">
          <Link
            href="/platform/profile"
            aria-current={profileActive ? "page" : undefined}
            title={userName ?? "Profile"}
            className={cn(
              "flex items-center gap-3 rounded-lg px-2 py-2 transition-colors",
              profileActive
                ? "bg-white/15 text-white"
                : "text-white/80 hover:bg-white/10 hover:text-white",
            )}
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                className="h-8 w-8 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span
                aria-hidden
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-medium text-white"
              >
                {userInitials(userName)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{userName ?? "Operator"}</p>
              <p className="truncate text-xs text-white/50">Profile</p>
            </div>
          </Link>
        </div>
      </aside>
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto px-6 py-8">
        {children}
      </main>
    </div>
  );
}
