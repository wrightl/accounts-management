"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Plus, Search } from "lucide-react";
import { addMenuFeatures } from "@/actions/menu";
import { cn } from "@/lib/utils";
import { HELP_NAV_ITEM, type NavGroup, type NavItem } from "./nav";
import { NAV_ICONS } from "./nav-icons";

const GROUP_CLASSES =
  "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted";

const ITEM_CLASSES = cn(
  "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm",
  "aria-selected:bg-wash aria-selected:text-foreground",
  "data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
);

export function NavCommandPalette({
  groups,
  hiddenGroups = [],
  settingsPages = [],
  canEditMenu = false,
  open,
  onOpenChange,
}: {
  groups: NavGroup[];
  /** Pages hidden from the menu: still searchable, and can be added back. */
  hiddenGroups?: NavGroup[];
  settingsPages?: NavItem[];
  canEditMenu?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [adding, startAdding] = useTransition();
  const [addError, setAddError] = useState<string | null>(null);
  const hiddenItems = hiddenGroups.flatMap((group) =>
    group.items.map((item) => ({ item, groupLabel: group.label })),
  );

  function addToMenu(item: NavItem) {
    if (!item.feature) return;
    const feature = item.feature;
    setAddError(null);
    startAdding(async () => {
      const result = await addMenuFeatures([feature]);
      if (!result.ok) {
        setAddError(result.error);
        return;
      }
      onOpenChange(false);
      router.push(item.href);
      router.refresh();
    });
  }

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onOpenChange(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

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
            {[
              ...groups,
              { id: "help", items: [HELP_NAV_ITEM] } satisfies NavGroup,
            ].map((group) => (
              <Command.Group
                key={group.id}
                heading={
                  group.id === "help" ? "Help" : (group.label ?? "Overview")
                }
                className={GROUP_CLASSES}
              >
                {group.items.map((item) => {
                  const Icon = NAV_ICONS[item.icon];
                  return (
                    <Command.Item
                      key={item.href}
                      value={
                        item.href === HELP_NAV_ITEM.href
                          ? `${item.label} how to use this app`
                          : `${group.label ?? ""} ${item.label}`
                      }
                      onSelect={() => navigate(item.href)}
                      className={ITEM_CLASSES}
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
            {settingsPages.length > 0 ? (
              <Command.Group heading="Settings" className={GROUP_CLASSES}>
                {settingsPages.map((item) => {
                  const Icon = NAV_ICONS[item.icon];
                  return (
                    <Command.Item
                      key={item.href}
                      value={`settings ${item.label}`}
                      onSelect={() => navigate(item.href)}
                      className={ITEM_CLASSES}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted" />
                      <span className="flex-1">{item.label}</span>
                      <span className="text-xs text-muted">Settings</span>
                    </Command.Item>
                  );
                })}
              </Command.Group>
            ) : null}
            {hiddenItems.length > 0 ? (
              <Command.Group heading="Not in your menu" className={GROUP_CLASSES}>
                {hiddenItems.map(({ item, groupLabel }) => {
                  const Icon = NAV_ICONS[item.icon];
                  return (
                    <Command.Item
                      key={item.href}
                      value={`${groupLabel ?? ""} ${item.label} hidden`}
                      onSelect={() => navigate(item.href)}
                      className={ITEM_CLASSES}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted" />
                      <span className="flex-1">{item.label}</span>
                      <span className="text-xs text-muted">Not in menu</span>
                    </Command.Item>
                  );
                })}
                {canEditMenu
                  ? hiddenItems.map(({ item, groupLabel }) => (
                      <Command.Item
                        key={`add-${item.href}`}
                        value={`${groupLabel ?? ""} ${item.label} add to menu`}
                        onSelect={() => addToMenu(item)}
                        disabled={adding}
                        className={ITEM_CLASSES}
                      >
                        <Plus className="h-4 w-4 shrink-0 text-muted" />
                        <span className="flex-1">
                          Add {item.label} to your menu
                        </span>
                      </Command.Item>
                    ))
                  : null}
              </Command.Group>
            ) : null}
          </Command.List>
          {addError ? (
            <p role="alert" className="border-t border-border px-4 py-2 text-sm text-destructive">
              {addError}
            </p>
          ) : null}
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
