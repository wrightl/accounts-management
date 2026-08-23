"use client";

import Link from "next/link";
import { Card, CardTitle, CardValue } from "@/components/ui/card";
import type { DashboardKpiGroup } from "@/lib/dashboard/queries";
import { cn } from "@/lib/utils";

function accentClass(accent: "default" | "destructive" | "brand" = "default"): string {
  switch (accent) {
    case "destructive":
      return "border-t-destructive";
    case "brand":
      return "border-t-brand";
    default:
      return "border-t-accent";
  }
}

export function KpiGrid({ groups }: { groups: DashboardKpiGroup[] }) {
  return (
    <div className="mt-6 space-y-8">
      {groups.map((group) => (
        <section key={group.label}>
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted">
            {group.label}
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.items.map((item) => (
              <Link
                key={item.title}
                href={item.href}
                className="block"
              >
                <Card
                  className={cn(
                    "border-t-4 transition-colors hover:bg-wash/30",
                    accentClass(item.accent),
                  )}
                >
                  <CardTitle>{item.title}</CardTitle>
                  <CardValue className={cn(item.accent === "destructive" && "text-destructive")}>
                    {item.value}
                  </CardValue>
                  {item.subtitle ? (
                    <p className="mt-1 text-sm text-muted">{item.subtitle}</p>
                  ) : null}
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
