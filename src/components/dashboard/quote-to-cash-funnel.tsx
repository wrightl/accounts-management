import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/card";
import type { FunnelStage } from "@/lib/dashboard/queries";

export function QuoteToCashFunnel({
  stages,
  periodLabel,
}: {
  stages: FunnelStage[];
  periodLabel: string;
}) {
  const max = Math.max(...stages.map((s) => s.valuePence), 1);
  const hasData = stages.some((s) => s.valuePence > 0);

  return (
    <Card className="h-full">
      <CardTitle>Quote → cash</CardTitle>
      <p className="mt-1 text-xs text-muted">
        Pipeline stock, then invoiced & collected for {periodLabel}
      </p>
      {!hasData ? (
        <div className="mt-6 space-y-2">
          <p className="text-sm text-muted">Nothing in the funnel yet.</p>
          <Link href="/quotes/new" className="text-sm text-brand hover:underline">
            Create a quote →
          </Link>
        </div>
      ) : (
        <ul className="mt-5 space-y-3">
          {stages.map((stage) => {
            const width = Math.max(8, Math.round((stage.valuePence / max) * 100));
            return (
              <li key={stage.key}>
                <Link href={stage.href} className="group block">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="text-muted group-hover:text-foreground">
                      {stage.label}
                    </span>
                    <span className="tabular-nums font-medium">
                      {stage.valueFormatted}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-wash">
                    <div
                      className="h-full rounded-full bg-navy transition-[width]"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
