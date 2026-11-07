import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { PAGE_WIDTH } from "@/components/ui/page-width";

/** Width for form-style settings pages. Table pages use the full width. */
export const SETTINGS_FORM_WIDTH = PAGE_WIDTH.reading;

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
    <PageHeader
      title={title}
      description={description}
      actions={actions}
      backHref={backHref}
      backLabel={backLabel}
      className="mb-8"
    />
  );
}
