"use client";

import Link from "next/link";
import { Card, CardValue } from "@/components/ui/card";
import type { HeroKpi } from "@/lib/dashboard/queries";
import { cn } from "@/lib/utils";

function Sparkline({ values, destructive }: { values: number[]; destructive?: boolean }) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const w = 64;
  const h = 24;
  const points = values
    .map((v, i) => {
      const x = values.length <= 1 ? 0 : (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 2) - 1;
      return `${x},${y}`;
    })
    .join(" ");

  if (values.every((v) => v === 0)) {
    return (
      <svg width={w} height={h} className="opacity-40" aria-hidden>
        <line
          x1={0}
          y1={h / 2}
          x2={w}
          y2={h / 2}
          stroke="var(--muted)"
          strokeWidth={1.5}
        />
      </svg>
    );
  }

  return (
    <svg width={w} height={h} aria-hidden className="shrink-0">
      <polyline
        fill="none"
        stroke={destructive ? "var(--destructive)" : "var(--periwinkle)"}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

function DeltaBadge({
  delta,
}: {
  delta: HeroKpi["delta"];
}) {
  const tone =
    delta.direction === "up"
      ? "text-success"
      : delta.direction === "down"
        ? "text-destructive"
        : "text-muted";

  return (
    <span className={cn("text-xs font-medium tabular-nums", tone)}>
      {delta.label}
      <span className="ml-1 font-normal text-muted">{delta.caption}</span>
    </span>
  );
}

export function HeroKpis({ heroes }: { heroes: HeroKpi[] }) {
  return (
    <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {heroes.map((hero) => (
        <Link key={hero.key} href={hero.href} className="block">
          <Card
            className={cn(
              "h-full transition-colors hover:bg-wash/40",
              hero.accent === "destructive" && "ring-1 ring-destructive/20",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-muted">{hero.title}</p>
              <Sparkline
                values={hero.sparkline}
                destructive={hero.accent === "destructive"}
              />
            </div>
            <CardValue
              className={cn(
                "mt-2 text-3xl",
                hero.accent === "destructive" && "text-destructive",
              )}
            >
              {hero.value}
            </CardValue>
            <div className="mt-2">
              <DeltaBadge delta={hero.delta} />
            </div>
            {hero.subtitle ? (
              <p className="mt-2 text-sm text-muted">{hero.subtitle}</p>
            ) : null}
            {hero.insight ? (
              <p className="mt-1 text-xs text-muted/90">{hero.insight}</p>
            ) : null}
          </Card>
        </Link>
      ))}
    </div>
  );
}
