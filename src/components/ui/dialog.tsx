"use client";

import { cn } from "@/lib/utils";
import { useEffect, useRef, type ComponentProps, type ReactNode } from "react";

export function Dialog({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={cn(
        "fixed inset-0 z-50 m-auto w-full max-w-lg rounded-2xl border border-border bg-surface p-0 shadow-xl backdrop:bg-navy/40 backdrop:backdrop-blur-sm",
        className,
      )}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClose={onClose}
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        <button
          type="button"
          className="rounded-full px-2 py-1 text-muted hover:bg-wash hover:text-foreground"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
      </div>
      <div className="p-5">{children}</div>
    </dialog>
  );
}

export function DialogActions({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("mt-4 flex flex-wrap items-center justify-end gap-2", className)}
      {...props}
    />
  );
}
