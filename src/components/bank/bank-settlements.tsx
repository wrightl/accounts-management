import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { BankSettlement } from "@/lib/bank/settlements";

/** "Settled by bank transaction" note with links back to the Transactions page. */
export function BankSettlements({
  settlements,
  className = "mb-6",
  action,
}: {
  settlements: BankSettlement[];
  className?: string;
  /** Extra control after each row's link, e.g. Unlink on an expense. */
  action?: ReactNode;
}) {
  if (settlements.length === 0) return null;
  return (
    <div className={cn("rounded-lg border border-border bg-wash/50 px-4 py-3 text-sm", className)}>
      <p className="font-medium">
        {settlements.length === 1 ? "Bank transaction" : "Bank transactions"}
      </p>
      <ul className="mt-1 space-y-1">
        {settlements.map((s) => (
          <li key={s.bankTransactionId} className="text-muted">
            {s.bookedAt} · {s.amountFormatted}
            {s.counterparty ? ` · ${s.counterparty}` : null}
            {s.bankAccountName ? ` · ${s.bankAccountName}` : null}{" "}
            <Link
              href={s.href}
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              View transaction →
            </Link>
            {action ? <> · {action}</> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
