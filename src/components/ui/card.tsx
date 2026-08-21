import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-surface p-5",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<"h3">) {
  return (
    <h3
      className={cn("text-sm font-normal text-muted", className)}
      {...props}
    />
  );
}

export function CardValue({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      className={cn("mt-2 font-display text-2xl font-normal tracking-tight", className)}
      {...props}
    />
  );
}
