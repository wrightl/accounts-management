"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  deleteNotificationAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/actions/notifications";
import type { Notification } from "@/db/schema";

function formatWhen(iso: Date | string): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function InboxClient({
  initial,
  filter,
}: {
  initial: Notification[];
  filter: "all" | "unread";
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(
    initial[0]?.id ?? null,
  );
  const [pending, startTransition] = useTransition();

  const selected = useMemo(
    () => items.find((n) => n.id === selectedId) ?? null,
    [items, selectedId],
  );

  function select(n: Notification) {
    setSelectedId(n.id);
    if (!n.readAt) {
      startTransition(async () => {
        await markNotificationReadAction(n.id);
        setItems((prev) =>
          prev.map((row) =>
            row.id === n.id ? { ...row, readAt: new Date() } : row,
          ),
        );
        router.refresh();
      });
    }
  }

  function onDelete(id: string) {
    startTransition(async () => {
      await deleteNotificationAction(id);
      setItems((prev) => {
        const next = prev.filter((n) => n.id !== id);
        if (selectedId === id) {
          setSelectedId(next[0]?.id ?? null);
        }
        return next;
      });
      router.refresh();
    });
  }

  function onMarkAll() {
    startTransition(async () => {
      await markAllNotificationsReadAction();
      setItems((prev) =>
        prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date() })),
      );
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Link
            href="/inbox"
            className={cn(
              "rounded-full px-3 py-1.5 text-sm",
              filter === "all"
                ? "bg-navy text-white"
                : "bg-wash text-muted hover:text-foreground",
            )}
          >
            All
          </Link>
          <Link
            href="/inbox?filter=unread"
            className={cn(
              "rounded-full px-3 py-1.5 text-sm",
              filter === "unread"
                ? "bg-navy text-white"
                : "bg-wash text-muted hover:text-foreground",
            )}
          >
            Unread
          </Link>
          <button
            type="button"
            onClick={onMarkAll}
            disabled={pending}
            className="ml-auto inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm text-muted hover:bg-wash hover:text-foreground"
          >
            <Check className="h-3.5 w-3.5" />
            Mark all read
          </button>
        </div>

        {items.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface px-6 py-12 text-center text-sm text-muted">
            No notifications{filter === "unread" ? " unread" : ""}.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-2xl border border-border bg-surface">
            {items.map((n) => {
              const unread = !n.readAt;
              const active = n.id === selectedId;
              return (
                <li key={n.id} className="border-b border-border last:border-0">
                  <button
                    type="button"
                    onClick={() => select(n)}
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-wash",
                      active && "bg-accent/15",
                      unread && !active && "bg-accent/5",
                    )}
                  >
                    {unread ? (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />
                    ) : (
                      <span className="mt-1.5 h-2 w-2 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{n.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted">
                        {n.body}
                      </p>
                      <p className="mt-1 text-[11px] text-muted/80">
                        {formatWhen(n.createdAt)}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="min-w-0">
        {selected ? (
          <article className="rounded-2xl border border-border bg-surface p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold">
                  {selected.title}
                </h2>
                <p className="mt-1 text-xs text-muted">
                  {formatWhen(selected.createdAt)}
                </p>
              </div>
              <button
                type="button"
                aria-label="Delete"
                onClick={() => onDelete(selected.id)}
                className="rounded-full p-2 text-muted hover:bg-wash hover:text-foreground"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {selected.body}
            </p>
            {selected.href ? (
              <Link
                href={selected.href}
                className="mt-6 inline-flex rounded-full bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy/90"
              >
                Open related item
              </Link>
            ) : null}
          </article>
        ) : (
          <div className="rounded-2xl border border-dashed border-border px-6 py-16 text-center text-sm text-muted">
            Select a notification to read it.
          </div>
        )}
      </div>
    </div>
  );
}
