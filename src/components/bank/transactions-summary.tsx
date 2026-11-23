import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import type { BankTransactionSummaryData } from "@/lib/bank/summary-types";
import { cn } from "@/lib/utils";
import { DisplayDate } from "@/components/date-format-provider";

function signedNet(pence: number, formatted: string): string {
  if (pence > 0) return `+${formatted}`;
  if (pence < 0) return `−${formatted}`;
  return formatted;
}

function Figure({
  label,
  value,
  note,
  className,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  className?: string;
}) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={cn("font-display text-xl tabular-nums", className)}>{value}</dd>
      {note ? <dd className="text-xs text-muted">{note}</dd> : null}
    </div>
  );
}

/** One strip above the transactions: money in, out, net, and what is left to match. */
export function TransactionsSummaryStrip({
  summary,
}: {
  summary: BankTransactionSummaryData;
}) {
  if (summary.totalCount === 0) return null;
  return (
    <Card className="mt-6">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Figure label="Money in" value={summary.incomingFormatted} className="text-success" />
        <Figure label="Money out" value={summary.outgoingFormatted} />
        <Figure
          label="Net"
          value={signedNet(summary.netPence, summary.netFormatted)}
          note={summary.periodLabel}
        />
        <Figure
          label="Still to match"
          value={
            summary.unreconciledCount > 0 ? (
              <Link
                href="/transactions?reconciliation=unreconciled"
                className="underline decoration-navy/30 underline-offset-4 hover:decoration-navy"
              >
                {summary.unreconciledCount}
              </Link>
            ) : (
              0
            )
          }
          note={`${summary.reconciledPercent}% matched`}
        />
        {summary.statementBalanceFormatted ? (
          <Figure
            label="Bank balance"
            value={summary.statementBalanceFormatted}
            note={
              summary.statementBalanceDate ? (
                <>
                  At <DisplayDate value={summary.statementBalanceDate} />
                </>
              ) : undefined
            }
          />
        ) : null}
      </dl>
    </Card>
  );
}
