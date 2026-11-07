import type { ReactNode } from "react";
import { BackLink } from "@/components/ui/back-link";
import { cn } from "@/lib/utils";

/**
 * Title row for every app page: optional way back, title and description on
 * the left, actions on the right (wrapping below the title on narrow screens).
 * Put secondary actions first and the primary action last, so it sits far right.
 */
export function PageHeader({
  title,
  description,
  actions,
  backHref,
  backLabel,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Buttons shown to the right of the title. */
  actions?: ReactNode;
  backHref?: string;
  backLabel?: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {backHref ? <BackLink href={backHref}>{backLabel}</BackLink> : null}
      <div
        className={cn(
          "flex flex-wrap items-start justify-between gap-4",
          backHref && "mt-4",
        )}
      >
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold">{title}</h1>
          {description ? <div className="mt-1 text-muted">{description}</div> : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}
