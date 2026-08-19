import { cn } from "@/lib/utils";

/**
 * Dot + Dash Consulting wordmark. Uses the stylised "+" in brand coral and a
 * blue dash accent, matching dotanddashconsulting.com.
 */
export function Logo({
  className,
  showConsulting = true,
}: {
  className?: string;
  showConsulting?: boolean;
}) {
  return (
    <span
      className={cn(
        "font-display inline-flex items-baseline gap-1 text-lg font-semibold tracking-tight",
        className,
      )}
    >
      <span>Dot</span>
      <span className="text-brand">+</span>
      <span>Dash</span>
      {showConsulting && (
        <span className="ml-1 text-muted font-sans text-xs font-normal uppercase tracking-widest">
          Consulting
        </span>
      )}
    </span>
  );
}
