import type { ReactNode } from "react";
import { FieldError } from "@/components/ui/form";
import { cn } from "@/lib/utils";

/**
 * Floating sticky footer for long forms: keeps Save reachable and shows a short
 * validation summary without scrolling away from the button.
 */
export function FormStickyActions({
  error,
  children,
  className,
}: {
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <>
      {/* In-flow spacer so the last field is not hidden behind the floating bar */}
      <div className="h-28 shrink-0" aria-hidden="true" />
      <div
        className={cn(
          "sticky bottom-4 z-10 rounded-2xl border border-border bg-surface/95 px-4 py-3 shadow-md backdrop-blur",
          "supports-[padding:max(0px)]:mb-[env(safe-area-inset-bottom)]",
          className,
        )}
      >
        <FieldError>{error}</FieldError>
        <div className="flex flex-wrap items-center gap-3">{children}</div>
      </div>
    </>
  );
}
