import Link from "next/link";
import { Card, CardTitle, CardValue } from "@/components/ui/card";
import type { HeroKpi } from "@/lib/dashboard/queries";
import { cn } from "@/lib/utils";

const lineTone = {
  up: "text-success",
  down: "text-destructive",
  flat: "text-muted",
} as const;

/** The four headline figures: a title, the figure and one plain-English line. */
export function HeroKpis({ heroes }: { heroes: HeroKpi[] }) {
  return (
    <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {heroes.map((hero) => (
        <Link key={hero.key} href={hero.href} className="block">
          <Card className="h-full transition-colors hover:bg-wash/40">
            <CardTitle>{hero.title}</CardTitle>
            <CardValue
              className={cn("text-3xl", hero.accent === "destructive" && "text-destructive")}
            >
              {hero.value}
            </CardValue>
            <p className={cn("mt-2 text-sm", lineTone[hero.line.direction])}>
              {hero.line.label}
            </p>
          </Card>
        </Link>
      ))}
    </div>
  );
}
