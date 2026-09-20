import Image from "next/image";
import { cn } from "@/lib/utils";
import { PRODUCT_LOCKUP, PRODUCT_MAKER, PRODUCT_NAME } from "@/lib/product";

export const LOGO_SRC = "/brand/alfa.png";

/**
 * Alfa square mark (blue tile, ALFA over Morse A) plus optional wordmark.
 * Colour of the wordmark inherits from the parent.
 */
export function Logo({
  className,
  showWordmark = true,
  showMaker = true,
  size = 40,
  priority = false,
}: {
  className?: string;
  showWordmark?: boolean;
  showMaker?: boolean;
  size?: number;
  priority?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <Image
        src={LOGO_SRC}
        alt={showWordmark ? "" : PRODUCT_LOCKUP}
        width={size}
        height={size}
        className="shrink-0 rounded-md"
        priority={priority}
        unoptimized
      />
      {showWordmark && (
        <span className="flex flex-col leading-tight">
          <span>{PRODUCT_NAME}</span>
          {showMaker ? (
            <span className="mt-0.5 text-xs tracking-widest uppercase opacity-80">
              by {PRODUCT_MAKER}
            </span>
          ) : null}
        </span>
      )}
    </span>
  );
}
