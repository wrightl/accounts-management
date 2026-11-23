import type { ReactNode } from "react";
import { BackLink } from "@/components/ui/back-link";
import { cn } from "@/lib/utils";

/**
 * Title row for every app page: optional way back, title and description on
 * the left, actions on the right. The title text wraps to make room for the
 * actions, which only drop below the title when the title would be squeezed
 * narrower than 10rem.
 * Put secondary actions first and the primary action last, so it sits far right.
 * Status badges and the edit button go in `titleAddon`, next to the title.
 */
export function PageHeader({
  title,
  titleAddon,
  description,
  actions,
  backHref,
  backLabel,
  backScroll,
  className,
}: {
  title: ReactNode;
  /** Shown beside the title, outside the heading: a status badge or edit button. */
  titleAddon?: ReactNode;
  description?: ReactNode;
  /** Buttons shown to the right of the title. */
  actions?: ReactNode;
  backHref?: string;
  backLabel?: ReactNode;
  /** Passed to the back link; false keeps the scroll position on return. */
  backScroll?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      {backHref ? (
        <BackLink href={backHref} scroll={backScroll}>
          {backLabel}
        </BackLink>
      ) : null}
      <div
        className={cn(
          "flex flex-wrap items-start justify-between gap-4",
          backHref && "mt-4",
        )}
      >
        <div className="min-w-0 flex-1 basis-40">
          {titleAddon ? (
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-semibold">{title}</h1>
              {titleAddon}
            </div>
          ) : (
            <h1 className="font-display text-2xl font-semibold">{title}</h1>
          )}
          {description ? (
            <div className="mt-1 max-w-3xl text-muted">{description}</div>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}
