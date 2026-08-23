"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavGroup } from "./nav";
import { NAV_ICONS } from "./nav-links";

export function NavCommandPalette({
  groups,
  open,
  onOpenChange,
}: {
  groups: NavGroup[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();

  function navigate(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]">
      <button
        type="button"
        className="absolute inset-0 bg-navy/40 backdrop-blur-sm"
        aria-label="Close search"
        onClick={() => onOpenChange(false)}
      />
      <div className="pointer-events-none absolute inset-x-0 top-[12vh] flex justify-center px-4">
        <Command
          key="nav-command-palette"
          className="pointer-events-auto w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-surface shadow-xl"
          loop
        >
          <div className="flex items-center gap-2 border-b border-border px-4">
            <Search className="h-4 w-4 shrink-0 text-muted" />
            <Command.Input
              placeholder="Search pages…"
              className="flex-1 bg-transparent py-3.5 text-sm outline-none placeholder:text-muted"
              autoFocus
            />
            <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-xs text-muted sm:inline">
              esc
            </kbd>
          </div>
          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="px-3 py-6 text-center text-sm text-muted">
              No pages found.
            </Command.Empty>
            {groups.map((group) => (
              <Command.Group
                key={group.id}
                heading={group.label ?? "Overview"}
                className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted"
              >
                {group.items.map((item) => {
                  const Icon = NAV_ICONS[item.icon];
                  return (
                    <Command.Item
                      key={item.href}
                      value={`${group.label ?? ""} ${item.label}`}
                      onSelect={() => navigate(item.href)}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm",
                        "aria-selected:bg-wash aria-selected:text-foreground",
                        "data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted" />
                      <span className="flex-1">{item.label}</span>
                      {group.label ? (
                        <span className="text-xs text-muted">{group.label}</span>
                      ) : null}
                    </Command.Item>
                  );
                })}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}

export function useNavCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((current) => !current);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return { open, setOpen };
}

export function NavSearchTrigger({
  onClick,
  collapsed,
  className,
}: {
  onClick: () => void;
  collapsed?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center overflow-hidden rounded-full text-sm text-white/70 transition-colors hover:bg-white/5 hover:text-white",
        collapsed ? "mx-auto justify-center p-2" : "mx-3 w-[calc(100%-1.5rem)] gap-2 px-3 py-2",
        className,
      )}
      aria-label="Search pages"
    >
      <Search className="h-4 w-4 shrink-0" />
      {!collapsed ? (
        <>
          <span className="flex-1 text-left">Search…</span>
          <kbd className="rounded border border-white/20 px-1.5 py-0.5 text-xs text-white/50">
            ⌘K
          </kbd>
        </>
      ) : null}
    </button>
  );
}
