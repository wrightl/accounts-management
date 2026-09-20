import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import type { DashboardAttentionData } from "@/lib/dashboard/queries";
import { cn } from "@/lib/utils";

function InboxSection({
  title,
  count,
  emptyMessage,
  priority,
  children,
}: {
  title: string;
  count: number;
  emptyMessage: string;
  priority?: "high" | "medium" | "low";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-3",
        priority === "high" && count > 0
          ? "border-destructive/30 bg-destructive/5"
          : "border-border bg-surface",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        {count > 0 ? (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs tabular-nums",
              priority === "high"
                ? "bg-destructive/15 text-destructive"
                : "bg-wash text-muted",
            )}
          >
            {count}
          </span>
        ) : null}
      </div>
      <div className="mt-2">
        {count > 0 ? children : (
          <p className="text-sm text-muted">{emptyMessage}</p>
        )}
      </div>
    </div>
  );
}

export function AttentionPanel({
  items,
  className,
}: {
  items: DashboardAttentionData;
  className?: string;
}) {
  const urgentCount =
    items.overdueInvoices.length +
    items.expiringQuotes.length +
    (items.unreconciledCount > 0 ? 1 : 0) +
    items.pendingExpenses.length +
    items.inboundEmailIssues.length;

  const allClear = urgentCount === 0;

  return (
    <Card className={cn("h-full", className)}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <CardTitle>Needs attention</CardTitle>
          <p className="mt-1 text-xs text-muted">
            {allClear
              ? "All caught up"
              : `${urgentCount} item${urgentCount === 1 ? "" : "s"} to clear`}
          </p>
        </div>
      </div>

      {allClear ? (
        <p className="mt-4 text-sm text-muted">
          Nothing urgent — enjoy the quiet morning.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          <InboxSection
            title="Overdue invoices"
            count={items.overdueInvoices.length}
            emptyMessage="No overdue invoices."
            priority="high"
          >
            <ul className="space-y-2 text-sm">
              {items.overdueInvoices.map((invoice) => (
                <li key={invoice.id}>
                  <Link
                    href={`/invoices/${invoice.id}`}
                    className="group block rounded-lg border border-border px-3 py-2 transition-colors hover:bg-wash/30"
                  >
                    <span className="font-medium group-hover:underline">
                      {invoice.number}
                    </span>
                    <span className="mt-0.5 block text-muted">
                      {invoice.clientName}
                    </span>
                    <span className="mt-1 block tabular-nums text-destructive">
                      {invoice.balanceFormatted}
                      {invoice.dueDate ? (
                        <span className="ml-2 text-muted">due {invoice.dueDate}</span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </InboxSection>

          <InboxSection
            title="Quotes expiring"
            count={items.expiringQuotes.length}
            emptyMessage="No quotes expiring within 30 days."
            priority="medium"
          >
            <ul className="space-y-2 text-sm">
              {items.expiringQuotes.map((quote) => (
                <li key={quote.id}>
                  <Link
                    href={`/quotes/${quote.id}`}
                    className="group block rounded-lg border border-border px-3 py-2 transition-colors hover:bg-wash/30"
                  >
                    <span className="font-medium group-hover:underline">
                      {quote.number}
                    </span>
                    <span className="mt-0.5 block text-muted">
                      {quote.clientName}
                    </span>
                    <span className="mt-1 block tabular-nums">
                      {quote.grossFormatted}
                      <span className="ml-2 text-brand">
                        until {quote.validUntil}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </InboxSection>

          <InboxSection
            title="Bank reconciliation"
            count={items.unreconciledCount}
            emptyMessage="All imported transactions are reconciled."
            priority="medium"
          >
            <Link
              href="/transactions"
              className="block rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-wash/30"
            >
              <span className="font-display text-2xl tabular-nums text-navy">
                {items.unreconciledCount}
              </span>
              <span className="mt-1 block text-muted">
                {items.unreconciledCount === 1
                  ? "unreconciled transaction"
                  : "unreconciled transactions"}
              </span>
              <span className="mt-2 inline-block text-brand hover:underline">
                Review transactions →
              </span>
            </Link>
          </InboxSection>

          <InboxSection
            title="Pending expenses"
            count={items.pendingExpenses.length}
            emptyMessage="No expenses awaiting review."
            priority="low"
          >
            <ul className="space-y-2 text-sm">
              {items.pendingExpenses.map((expense) => (
                <li key={expense.id}>
                  <Link
                    href={`/expenses/${expense.id}`}
                    className="group block rounded-lg border border-border px-3 py-2 transition-colors hover:bg-wash/30"
                  >
                    <span className="font-medium group-hover:underline">
                      {expense.description}
                    </span>
                    <span className="mt-0.5 block text-muted">
                      {expense.submitterLabel}
                    </span>
                    <span className="mt-1 block tabular-nums text-brand">
                      {expense.amountFormatted}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </InboxSection>

          {items.inboundEmailIssues.length > 0 ? (
            <InboxSection
              title="Inbound email failures"
              count={items.inboundEmailIssues.length}
              emptyMessage="No inbound email processing errors."
              priority="high"
            >
              <ul className="space-y-2 text-sm">
                {items.inboundEmailIssues.map((job) => (
                  <li key={job.id}>
                    <Link
                      href={`/inbound-email/${job.id}`}
                      className="group block rounded-lg border border-destructive/30 px-3 py-2 transition-colors hover:bg-destructive/5"
                    >
                      <span className="font-medium group-hover:underline">
                        {job.subject || "(no subject)"}
                      </span>
                      <span className="mt-0.5 block text-muted">
                        {job.fromEmail}
                      </span>
                      <span className="mt-1 block text-xs text-destructive">
                        {job.attempts === 1
                          ? "1 attempt"
                          : `${job.attempts} attempts`}
                        {job.lastError ? " · processing failed" : ""}
                      </span>
                    </Link>
                  </li>
                ))}
                <li>
                  <Link
                    href="/inbound-email"
                    className="inline-block text-brand hover:underline"
                  >
                    View all inbound jobs →
                  </Link>
                </li>
              </ul>
            </InboxSection>
          ) : null}
        </div>
      )}

      {/* Compact secondary founder / ops stats */}
      <div className="mt-5 grid grid-cols-2 gap-2 border-t border-border pt-4 text-xs">
        <Link href="/reimbursements" className="rounded-lg bg-wash/50 px-2.5 py-2 hover:bg-wash">
          <span className="block text-muted">Owed to me</span>
          <span className="mt-0.5 block tabular-nums font-medium">
            {items.owedToMeFormatted}
          </span>
        </Link>
        <Link href="/expenses" className="rounded-lg bg-wash/50 px-2.5 py-2 hover:bg-wash">
          <span className="block text-muted">Reimbursable</span>
          <span className="mt-0.5 block tabular-nums font-medium">
            {items.reimbursableFormatted}
          </span>
        </Link>
        {items.unbilledFormatted !== "£0.00" ? (
          <Link href="/orders" className="rounded-lg bg-wash/50 px-2.5 py-2 hover:bg-wash">
            <span className="block text-muted">Unbilled orders</span>
            <span className="mt-0.5 block tabular-nums font-medium">
              {items.unbilledFormatted}
            </span>
          </Link>
        ) : null}
        {items.recurringUpcomingFormatted !== "£0.00" ? (
          <Link href="/recurring-invoices" className="rounded-lg bg-wash/50 px-2.5 py-2 hover:bg-wash">
            <span className="block text-muted">Recurring next</span>
            <span className="mt-0.5 block tabular-nums font-medium">
              {items.recurringUpcomingFormatted}
            </span>
          </Link>
        ) : null}
        {items.winRatePercent != null ? (
          <div className="rounded-lg bg-wash/50 px-2.5 py-2">
            <span className="block text-muted">Quote win rate</span>
            <span className="mt-0.5 block tabular-nums font-medium">
              {items.winRatePercent}%
            </span>
          </div>
        ) : null}
        {items.dsoDays != null ? (
          <div className="rounded-lg bg-wash/50 px-2.5 py-2">
            <span className="block text-muted">Avg DSO</span>
            <span className="mt-0.5 block tabular-nums font-medium">
              {items.dsoDays} days
            </span>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
