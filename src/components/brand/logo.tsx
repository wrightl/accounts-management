import Image from "next/image";
import { cn } from "@/lib/utils";

export const LOGO_SRC = "/brand/logo.png";

/**
 * Official Dot + Dash square mark (blue tile, stacked DOT + / DASH)
 * plus optional wordmark. Colour of the wordmark inherits from the parent.
 */
export function Logo({
  className,
  showConsulting = false,
  showWordmark = true,
  subtitle,
  size = 40,
  priority = false,
}: {
  className?: string;
  showConsulting?: boolean;
  showWordmark?: boolean;
  subtitle?: string;
  size?: number;
  priority?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <Image
        src={LOGO_SRC}
        alt="Dot + Dash"
        width={size}
        height={size}
        className="shrink-0 rounded-md"
        priority={priority}
      />
      {showWordmark && (
        <span className="flex flex-col leading-tight">
          <span>Dot + Dash{showConsulting ? " Consulting" : ""}</span>
          {subtitle ? (
            <span className="mt-0.5 text-xs tracking-widest uppercase opacity-80">
              {subtitle}
            </span>
          ) : null}
        </span>
      )}
    </span>
  );
}
