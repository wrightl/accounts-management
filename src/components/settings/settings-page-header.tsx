import Link from "next/link";
import type { ReactNode } from "react";

/** Width for form-style settings pages. Table pages use the full width. */
export const SETTINGS_FORM_WIDTH = "max-w-2xl";

/**
 * Shared header for every page reached from the Settings hub, so each one has
 * the same way back, title placement and spacing.
 */
export function SettingsPageHeader({
  title,
  description,
  actions,
  backHref = "/settings",
  backLabel = "Settings",
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Buttons shown to the right of the title. */
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="mb-8">
      <p className="text-sm text-muted">
        <Link href={backHref} className="hover:underline">
          ← {backLabel}
        </Link>
      </p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold">{title}</h1>
          {description ? <p className="mt-1 text-muted">{description}</p> : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}
