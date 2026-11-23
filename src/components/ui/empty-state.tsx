import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { cardClasses } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * What to show where a list or table would be when it has no rows.
 *
 * - Full (with a title): the first-run state of a whole page, with the
 *   action that fills it.
 * - Compact (no title): a section or filtered list with nothing in it. It
 *   takes the table's place in the same card shape, so the page keeps its
 *   rhythm.
 *
 * Inside a card that is already a box (a chart, a settings panel) a plain
 * muted line is enough; don't nest an EmptyState there.
 */
export function EmptyState({
  title,
  description,
  actionHref,
  actionLabel,
  actionIcon,
  className,
}: {
  /** Leave out for the compact form. */
  title?: string;
  description: ReactNode;
  actionHref?: string;
  actionLabel?: string;
  /** Optional leading icon for the action, e.g. `<Plus className="h-4 w-4" />`. */
  actionIcon?: ReactNode;
  className?: string;
}) {
  const action =
    actionHref && actionLabel ? (
      <Link
        href={actionHref}
        className={cn(buttonClasses(title ? "primary" : "ghost"), title ? "mt-6" : "mt-4")}
      >
        {actionIcon}
        {actionLabel}
      </Link>
    ) : null;

  if (!title) {
    return (
      <div className={cardClasses(cn("px-5 py-6 text-center text-sm text-muted", className))}>
        <p className="mx-auto max-w-md">{description}</p>
        {action}
      </div>
    );
  }

  return (
    <div className={cardClasses(cn("px-6 py-10 text-center", className))}>
      <h2 className="font-display text-lg font-semibold text-foreground">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{description}</p>
      {action}
    </div>
  );
}
