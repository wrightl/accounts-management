import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/#product", label: "Product" },
  { href: "/#who", label: "Who it's for" },
  { href: "/#how", label: "How it works" },
  { href: "/guides", label: "Guides" },
] as const;

export function PublicHeader({
  variant = "dark",
}: {
  variant?: "dark" | "light";
}) {
  const dark = variant === "dark";
  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b backdrop-blur",
        dark
          ? "border-white/10 bg-navy/90 text-white"
          : "border-border bg-white/90 text-foreground",
      )}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <Link href="/" className="shrink-0">
          <Logo showConsulting size={40} priority />
        </Link>
        <nav
          aria-label="Marketing"
          className="hidden items-center gap-6 text-sm md:flex"
        >
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "transition-colors",
                dark ? "text-white/75 hover:text-white" : "text-muted hover:text-foreground",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/sign-in"
            className={buttonClasses(
              "ghost",
              dark
                ? "text-white hover:bg-white/15"
                : "text-foreground hover:bg-wash",
            )}
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className={buttonClasses("primary", "px-5 py-2")}
          >
            Sign up
          </Link>
        </div>
      </div>
    </header>
  );
}
