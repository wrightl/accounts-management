import { cn } from "@/lib/utils";

/** Pink dot + periwinkle dash — the brand mark from the company name. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1", className)}
      aria-hidden="true"
    >
      <span className="size-2 shrink-0 rounded-full bg-brand" />
      <span className="h-0.5 w-3 shrink-0 rounded-full bg-current opacity-80" />
    </span>
  );
}

/**
 * Dot + Dash wordmark. Matches the marketing site: one geometric line,
 * no coloured plus. Colour inherits from the parent (`currentColor`).
 */
export function Logo({
  className,
  showConsulting = false,
  showMark = true,
}: {
  className?: string;
  showConsulting?: boolean;
  showMark?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-lg font-normal tracking-tight",
        className,
      )}
    >
      {showMark && <BrandMark />}
      <span>
        Dot + Dash{showConsulting ? " Consulting" : ""}
      </span>
    </span>
  );
}
