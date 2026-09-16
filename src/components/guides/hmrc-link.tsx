import { ExternalLink } from "lucide-react";

export function HmrcLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-medium text-navy underline decoration-navy/30 underline-offset-2 hover:decoration-navy"
    >
      {children}
      <ExternalLink className="inline h-3.5 w-3.5" aria-hidden="true" />
      <span className="sr-only">(opens in new tab)</span>
    </a>
  );
}
