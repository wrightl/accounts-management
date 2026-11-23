import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

/**
 * Button hierarchy, so pages read the same way:
 * - primary (pink): the one thing this view is for. At most one per view.
 * - secondary (navy): the main alternative, or the submit of a small inline
 *   form. Use sparingly; two navy buttons side by side compete with the pink.
 * - ghost (outline): everything else, including Copy, Cancel, Filter, Export.
 * - destructive: deletes and other actions that can't be undone.
 */
export type Variant = "primary" | "secondary" | "ghost" | "destructive";

const variants: Record<Variant, string> = {
  primary: "bg-brand text-brand-foreground hover:bg-brand-hover",
  secondary: "bg-navy text-white hover:bg-navy/90",
  ghost: "border-navy/30 bg-surface text-foreground hover:border-navy/60 hover:bg-wash",
  destructive: "bg-destructive text-white hover:bg-destructive/90",
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-full border border-transparent px-5 py-2 text-sm font-normal tracking-wide transition-colors disabled:pointer-events-none disabled:opacity-50";

/** Shared classes so links can look like buttons without a polymorphic wrapper. */
export function buttonClasses(variant: Variant = "primary", className?: string): string {
  return cn(base, variants[variant], className);
}

export function Button({
  className,
  variant = "primary",
  ...props
}: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={buttonClasses(variant, className)} {...props} />;
}
