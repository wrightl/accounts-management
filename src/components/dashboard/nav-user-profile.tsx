"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { roleLabel, type Role } from "@/lib/roles";

function userInitials(userName: string | null): string {
  if (!userName) return "?";
  const parts = userName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

export function NavUserProfile({
  collapsed,
  role,
  userName,
  avatarUrl,
  active = false,
  onNavigate,
}: {
  collapsed: boolean;
  role: Role;
  userName: string | null;
  avatarUrl: string | null;
  active?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href="/dashboard/profile"
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={userName ?? "Profile"}
      className={cn(
        "mt-1 flex items-center overflow-hidden rounded-full transition-colors hover:bg-white/5",
        active && "bg-white/10",
        collapsed ? "justify-center py-2" : "mx-3 gap-3 px-3 py-2",
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
      <div
        aria-hidden={collapsed}
        className={cn(
          "min-w-0 flex-1 transition-opacity duration-200 ease-out",
          collapsed ? "w-0 overflow-hidden opacity-0" : "opacity-100",
        )}
      >
        {userName ? (
          <p className="truncate text-sm text-white">{userName}</p>
        ) : null}
        <p className="truncate text-xs text-white/50">{roleLabel(role)}</p>
      </div>
    </Link>
  );
}
