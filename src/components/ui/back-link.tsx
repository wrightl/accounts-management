import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The button at the top of a page that goes back up a level. */
export function BackLink({
  href,
  children,
  scroll,
  className,
}: {
  href: string;
  children: ReactNode;
  scroll?: boolean;
  className?: string;
}) {
  return (
    <Link href={href} scroll={scroll} className={buttonClasses("ghost", cn("pl-4", className))}>
      <ArrowLeft className="size-4 shrink-0" aria-hidden />
      {children}
    </Link>
  );
}
