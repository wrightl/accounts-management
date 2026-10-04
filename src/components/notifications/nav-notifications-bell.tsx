"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Check, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { overlayPortalTarget } from "@/components/ui/portal-target";
import {
  deleteNotificationAction,
  fetchNotificationsAction,
  fetchUnreadCountAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/actions/notifications";

type PanelPosition = {
  left: number;
  bottom: number;
  width: number;
  maxHeight: number;
};

/** Place the panel above the page. The sidebar clips overflow, so an in-flow menu paints under main. */
function measurePanel(rect: DOMRect, collapsed: boolean): PanelPosition {
  const margin = 8;
  const gap = 8;
  const rem =
    parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const width = Math.min(22 * rem, window.innerWidth - margin * 2);
  let left = collapsed ? rect.right + gap : rect.right - width;
  left = Math.min(Math.max(margin, left), window.innerWidth - margin - width);
  const bottom = collapsed
    ? window.innerHeight - rect.bottom
    : window.innerHeight - rect.top + gap;
  const available = Math.max(10 * rem, window.innerHeight - bottom - margin);
  const maxHeight = Math.min(28 * rem, window.innerHeight * 0.7, available);
  return { left, bottom, width, maxHeight };
}

type NotificationRow = {
  id: string;
  title: string;
  body: string;
  href: string | null;
  readAt: Date | string | null;
  createdAt: Date | string;
  type: string;
};

function formatRelative(iso: Date | string): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function NavNotificationsBell({
  collapsed,
  className,
}: {
  collapsed: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [pending, startTransition] = useTransition();
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const updatePosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    setPosition(measurePanel(button.getBoundingClientRect(), collapsed));
  }, [collapsed]);

  const refreshCount = useCallback(() => {
    void fetchUnreadCountAction().then((res) => {
      if (res.ok) setUnreadCount(res.unreadCount);
    });
  }, []);

  const loadList = useCallback(() => {
    startTransition(() => {
      void fetchNotificationsAction({ limit: 20 }).then((res) => {
        if (!res.ok) return;
        setItems(res.notifications);
        setUnreadCount(res.unreadCount);
      });
    });
  }, []);

  useEffect(() => {
    refreshCount();
    const id = window.setInterval(refreshCount, 45_000);
    return () => window.clearInterval(id);
  }, [refreshCount]);

  useEffect(() => {
    if (!open) return;
    loadList();
    updatePosition();
    const button = buttonRef.current;
    const aside = button?.closest("aside");
    const observer = new ResizeObserver(() => updatePosition());
    if (aside) observer.observe(aside);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (
        panelRef.current?.contains(target) ||
        buttonRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, loadList, updatePosition]);

  function onOpenToggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const button = buttonRef.current;
    if (button) {
      setPortalTarget(overlayPortalTarget(button) ?? document.body);
      setPosition(measurePanel(button.getBoundingClientRect(), collapsed));
    }
    setOpen(true);
  }

  function onClickItem(n: NotificationRow) {
    startTransition(async () => {
      if (!n.readAt) {
        await markNotificationReadAction(n.id);
        setUnreadCount((c) => Math.max(0, c - 1));
        setItems((prev) =>
          prev.map((row) =>
            row.id === n.id ? { ...row, readAt: new Date() } : row,
          ),
        );
      }
      setOpen(false);
      if (n.href) {
        router.push(n.href);
      } else {
        router.push(`/inbox/${n.id}`);
      }
    });
  }

  function onDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    startTransition(async () => {
      const row = items.find((n) => n.id === id);
      await deleteNotificationAction(id);
      setItems((prev) => prev.filter((n) => n.id !== id));
      if (row && !row.readAt) {
        setUnreadCount((c) => Math.max(0, c - 1));
      }
    });
  }

  function onMarkAll() {
    startTransition(async () => {
      await markAllNotificationsReadAction();
      setUnreadCount(0);
      setItems((prev) =>
        prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date() })),
      );
    });
  }

  return (
    <div className={cn("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        onClick={onOpenToggle}
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Notifications"
        className={cn(
          "relative inline-flex items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white",
          collapsed ? "h-10 w-10" : "h-9 w-9",
        )}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 ? (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-navy">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open && position && portalTarget
        ? createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Notifications"
          style={{
            left: position.left,
            bottom: position.bottom,
            width: position.width,
            maxHeight: position.maxHeight,
          }}
          className="fixed z-[100] flex flex-col overflow-hidden rounded-2xl border border-border bg-surface text-foreground shadow-xl"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h2 className="font-display text-sm font-semibold">Notifications</h2>
            <div className="flex items-center gap-2">
              {unreadCount > 0 ? (
                <button
                  type="button"
                  onClick={onMarkAll}
                  disabled={pending}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted hover:bg-wash hover:text-foreground"
                >
                  <Check className="h-3 w-3" />
                  Mark all read
                </button>
              ) : null}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted">
                {pending ? "Loading…" : "No notifications yet."}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((n) => {
                  const unread = !n.readAt;
                  return (
                    <li key={n.id}>
                      <div className="group flex items-start gap-1">
                        <button
                          type="button"
                          onClick={() => onClickItem(n)}
                          className={cn(
                            "min-w-0 flex-1 px-4 py-3 text-left transition-colors hover:bg-wash",
                            unread && "bg-accent/10",
                          )}
                        >
                          <div className="flex items-start gap-2">
                            {unread ? (
                              <span
                                aria-label="Unread"
                                className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand"
                              />
                            ) : (
                              <span className="mt-1.5 h-2 w-2 shrink-0" />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                {n.title}
                              </p>
                              <p className="mt-0.5 line-clamp-2 text-xs text-muted">
                                {n.body}
                              </p>
                              <p className="mt-1 text-[11px] text-muted/80">
                                {formatRelative(n.createdAt)}
                              </p>
                            </div>
                          </div>
                        </button>
                        <button
                          type="button"
                          aria-label="Delete notification"
                          onClick={(e) => onDelete(n.id, e)}
                          className="mr-2 mt-3 rounded-full p-1.5 text-muted opacity-0 transition-opacity hover:bg-wash hover:text-foreground group-hover:opacity-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-border px-4 py-2">
            <Link
              href="/inbox"
              onClick={() => setOpen(false)}
              className="block rounded-full py-2 text-center text-sm font-medium text-navy hover:bg-wash"
            >
              View all
            </Link>
          </div>
        </div>,
          portalTarget,
        )
        : null}
    </div>
  );
}
