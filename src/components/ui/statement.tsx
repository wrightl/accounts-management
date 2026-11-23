import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { HowWorkedOut } from "@/components/ui/how-worked-out";
import { cn } from "@/lib/utils";

export type StatementRow = {
  label: ReactNode;
  value: ReactNode;
  /** A short qualifier shown under the label, such as "After £50 of credit notes". */
  note?: ReactNode;
};

/**
 * Figures that add up, read top to bottom like a simple account: rows, then a
 * total. Use this instead of a row of separate stat cards when the figures
 * belong together.
 */
export function Statement({
  title,
  aside,
  help,
  rows,
  total,
  className,
}: {
  title: ReactNode;
  /** Shown at the right of the title row, e.g. the VAT number. */
  aside?: ReactNode;
  /** How the figures are worked out, behind a help icon beside the title. */
  help?: ReactNode;
  rows: StatementRow[];
  total?: StatementRow;
  className?: string;
}) {
  return (
    <Card className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        {help ? <HowWorkedOut>{help}</HowWorkedOut> : null}
        {aside ? <div className="ml-auto text-sm text-muted">{aside}</div> : null}
      </div>
      <dl className="mt-3 text-sm">
        {rows.map((row, i) => (
          <div
            key={i}
            className={cn(
              "flex items-baseline justify-between gap-4 py-2",
              (total || i < rows.length - 1) && "border-b border-border",
            )}
          >
            <dt>
              {row.label}
              {row.note ? <span className="block text-xs text-muted">{row.note}</span> : null}
            </dt>
            <dd className="tabular-nums">{row.value}</dd>
          </div>
        ))}
        {total ? (
          <div className="flex items-baseline justify-between gap-4 pt-3 font-semibold">
            <dt>
              {total.label}
              {total.note ? (
                <span className="block text-xs font-normal text-muted">{total.note}</span>
              ) : null}
            </dt>
            <dd className="font-display text-xl tabular-nums">{total.value}</dd>
          </div>
        ) : null}
      </dl>
    </Card>
  );
}
