import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

export type Variant = "primary" | "secondary" | "ghost" | "destructive";

const variants: Record<Variant, string> = {
  primary: "bg-brand text-brand-foreground hover:bg-brand-hover",
  secondary: "bg-navy text-white hover:bg-navy/90",
  ghost: "bg-transparent text-foreground hover:bg-wash",
  destructive: "bg-red-700 text-white hover:bg-red-800",
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2 text-sm font-normal tracking-wide transition-colors disabled:pointer-events-none disabled:opacity-50";

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
