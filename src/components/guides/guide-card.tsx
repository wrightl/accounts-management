import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";

export function GuideCard({
  href,
  title,
  description,
  icon,
}: {
  href: string;
  title: string;
  description: string;
  icon?: React.ReactNode;
}) {
  return (
    <Link href={href}>
      <Card className="group h-full transition-all hover:border-navy/30 hover:shadow-sm">
        {icon && <div className="mb-4 text-navy">{icon}</div>}
        <h3 className="font-display text-xl font-semibold text-foreground">
          {title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {description}
        </p>
        <div className="mt-4 flex items-center gap-1 text-sm font-medium text-navy">
          Read guide
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </div>
      </Card>
    </Link>
  );
}
