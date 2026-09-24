"use client";

import { useSyncExternalStore } from "react";
import { Check, X } from "lucide-react";
import {
  dismissToast,
  getToastSnapshot,
  pauseToast,
  resumeToast,
  subscribeToasts,
  EMPTY_TOASTS,
} from "@/components/ui/toast-store";

export { toast } from "@/components/ui/toast-store";

export function Toaster() {
  const toasts = useSyncExternalStore(
    subscribeToasts,
    getToastSnapshot,
    () => EMPTY_TOASTS,
  );

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end"
      aria-live="polite"
      aria-relevant="additions"
    >
      {toasts.map((item) => (
        <div
          key={item.id}
          role="status"
          className="pointer-events-auto flex max-w-sm items-start gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-sm shadow-xl"
          onMouseEnter={() => pauseToast(item.id)}
          onMouseLeave={() => resumeToast(item.id)}
          onFocusCapture={() => pauseToast(item.id)}
          onBlurCapture={() => resumeToast(item.id)}
        >
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
          <p className="flex-1">{item.message}</p>
          <button
            type="button"
            className="rounded-full p-0.5 text-muted hover:bg-wash hover:text-foreground"
            onClick={() => dismissToast(item.id)}
            aria-label="Dismiss notification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
