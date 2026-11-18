import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  actionHref,
  actionLabel,
  actionIcon,
  className,
}: {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
  /** Optional leading icon for the action, e.g. `<Plus className="h-4 w-4" />`. */
  actionIcon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-surface px-6 py-10 text-center",
        className,
      )}
    >
      <h2 className="font-display text-lg font-semibold text-foreground">
        {title}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{description}</p>
      {actionHref && actionLabel ? (
        <Link
          href={actionHref}
          className={cn(buttonClasses("primary"), "mt-6 inline-flex")}
        >
          {actionIcon}
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
