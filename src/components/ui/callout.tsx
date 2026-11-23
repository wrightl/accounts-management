import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type CalloutTone = "info" | "warning" | "danger" | "success";

/**
 * Background and border for each tone. Body text stays navy in every tone so
 * it keeps the same contrast; the tint says what kind of note it is.
 * Exported for full-width bars (the app shell banners) that can't be a card.
 */
export const calloutTones: Record<CalloutTone, string> = {
  info: "border-transparent bg-wash",
  warning: "border-warning/25 bg-warning-wash",
  danger: "border-destructive/25 bg-destructive-wash",
  success: "border-success/25 bg-success-wash",
};

/**
 * A short note inside a page: something to know, check, fix or that just
 * worked. Use this instead of hand-picked amber/red/green boxes so every page
 * draws them the same way.
 */
export function Callout({
  tone = "info",
  title,
  className,
  children,
  ...props
}: Omit<ComponentProps<"div">, "title"> & {
  tone?: CalloutTone;
  /** Optional bold first line. */
  title?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 text-sm text-foreground",
        calloutTones[tone],
        className,
      )}
      {...props}
    >
      {title ? <p className="font-medium">{title}</p> : null}
      {title ? <div className="mt-1">{children}</div> : children}
    </div>
  );
}
