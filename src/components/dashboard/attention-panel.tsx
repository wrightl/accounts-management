import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import type { DashboardAttentionData } from "@/lib/dashboard/queries";
import { cn } from "@/lib/utils";

function AttentionSection({
  title,
  emptyMessage,
  children,
}: {
  title: string;
  emptyMessage: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <div className="mt-2">{children ?? <p className="text-sm text-muted">{emptyMessage}</p>}</div>
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
  const allClear =
    items.overdueInvoices.length === 0 &&
    items.expiringQuotes.length === 0 &&
    items.unreconciledCount === 0 &&
    items.pendingExpenses.length === 0 &&
    items.inboundEmailIssues.length === 0;

  return (
    <Card className={cn(className)}>
      <CardTitle>Needs attention</CardTitle>
      {allClear ? (
        <p className="mt-4 text-sm text-muted">All caught up — nothing urgent right now.</p>
      ) : (
        <div className="mt-4 grid gap-6 md:grid-cols-2 xl:grid-cols-5">
          <AttentionSection
            title="Overdue invoices"
            emptyMessage="No overdue invoices."
          >
            {items.overdueInvoices.length > 0 ? (
              <ul className="space-y-2 text-sm">
                {items.overdueInvoices.map((invoice) => (
                  <li key={invoice.id}>
                    <Link
                      href={`/dashboard/invoices/${invoice.id}`}
                      className="group block rounded-lg border border-border px-3 py-2 transition-colors hover:bg-wash/30"
                    >
                      <span className="font-medium group-hover:underline">
                        {invoice.number}
                      </span>
                      <span className="mt-0.5 block text-muted">{invoice.clientName}</span>
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
            ) : null}
          </AttentionSection>

          <AttentionSection
            title="Quotes expiring soon"
            emptyMessage="No quotes expiring within 30 days."
          >
            {items.expiringQuotes.length > 0 ? (
              <ul className="space-y-2 text-sm">
                {items.expiringQuotes.map((quote) => (
                  <li key={quote.id}>
                    <Link
                      href={`/dashboard/quotes/${quote.id}`}
                      className="group block rounded-lg border border-border px-3 py-2 transition-colors hover:bg-wash/30"
                    >
                      <span className="font-medium group-hover:underline">
                        {quote.number}
                      </span>
                      <span className="mt-0.5 block text-muted">{quote.clientName}</span>
                      <span className="mt-1 block tabular-nums">
                        {quote.grossFormatted}
                        <span className="ml-2 text-brand">valid until {quote.validUntil}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </AttentionSection>

          <AttentionSection
            title="Bank reconciliation"
            emptyMessage="All imported transactions are reconciled."
          >
            {items.unreconciledCount > 0 ? (
              <Link
                href="/dashboard/transactions"
                className="block rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-wash/30"
              >
                <span className="font-display text-2xl tabular-nums text-brand">
                  {items.unreconciledCount}
                </span>
                <span className="mt-1 block text-muted">
                  unreconciled transaction{items.unreconciledCount === 1 ? "" : "s"}
                </span>
                <span className="mt-2 inline-block text-brand hover:underline">
                  Review transactions →
                </span>
              </Link>
            ) : null}
          </AttentionSection>

          <AttentionSection
            title="Pending expense reviews"
            emptyMessage="No expenses awaiting review."
          >
            {items.pendingExpenses.length > 0 ? (
              <ul className="space-y-2 text-sm">
                {items.pendingExpenses.map((expense) => (
                  <li key={expense.id}>
                    <Link
                      href={`/dashboard/expenses/${expense.id}`}
                      className="group block rounded-lg border border-border px-3 py-2 transition-colors hover:bg-wash/30"
                    >
                      <span className="font-medium group-hover:underline">
                        {expense.description}
                      </span>
                      <span className="mt-0.5 block text-muted">{expense.submitterLabel}</span>
                      <span className="mt-1 block tabular-nums text-brand">
                        {expense.amountFormatted}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </AttentionSection>

          <AttentionSection
            title="Inbound email failures"
            emptyMessage="No inbound email processing errors."
          >
            {items.inboundEmailIssues.length > 0 ? (
              <ul className="space-y-2 text-sm">
                {items.inboundEmailIssues.map((job) => (
                  <li key={job.id}>
                    <Link
                      href={`/dashboard/inbound-email/${job.id}`}
                      className="group block rounded-lg border border-destructive/30 px-3 py-2 transition-colors hover:bg-destructive/5"
                    >
                      <span className="font-medium group-hover:underline">
                        {job.subject || "(no subject)"}
                      </span>
                      <span className="mt-0.5 block text-muted">{job.fromEmail}</span>
                      <span className="mt-1 block text-xs text-destructive">
                        {job.attempts} attempt{job.attempts === 1 ? "" : "s"}
                        {job.lastError ? " · processing failed" : ""}
                      </span>
                    </Link>
                  </li>
                ))}
                <li>
                  <Link
                    href="/dashboard/inbound-email"
                    className="inline-block text-brand hover:underline"
                  >
                    View all inbound jobs →
                  </Link>
                </li>
              </ul>
            ) : null}
          </AttentionSection>
        </div>
      )}
    </Card>
  );
}
