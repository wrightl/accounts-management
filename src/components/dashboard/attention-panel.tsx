import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import type { DashboardAttentionData } from "@/lib/dashboard/queries";
import { cn } from "@/lib/utils";
import { DisplayDate } from "@/components/date-format-provider";

/** One group of things to do. Only shown when it has something in it. */
function Group({
  title,
  count,
  urgent,
  children,
}: {
  title: string;
  count: number;
  urgent?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="py-3 first:pt-0 last:pb-0">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        {title}
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs tabular-nums",
            urgent ? "bg-destructive/15 text-destructive" : "bg-wash text-muted",
          )}
        >
          {count}
        </span>
      </h3>
      <ul className="mt-1 text-sm">{children}</ul>
    </section>
  );
}

/** A row that opens the record: what it is on the left, the amount on the right. */
function Row({
  href,
  primary,
  secondary,
  amount,
  amountClassName,
}: {
  href: string;
  primary: ReactNode;
  secondary?: ReactNode;
  amount?: ReactNode;
  amountClassName?: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="-mx-2 flex items-baseline justify-between gap-3 rounded-xl px-2 py-1.5 hover:bg-wash"
      >
        <span className="min-w-0">
          <span className="font-medium">{primary}</span>
          {secondary ? <span className="ml-2 text-muted">{secondary}</span> : null}
        </span>
        {amount ? (
          <span className={cn("shrink-0 tabular-nums", amountClassName)}>{amount}</span>
        ) : null}
      </Link>
    </li>
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
    items.pendingExpensesCount +
    items.inboundEmailIssues.length;

  const stats = [
    { href: "/reimbursements", label: "Owed to you", value: items.owedToMeFormatted },
    { href: "/expenses", label: "Reimbursable", value: items.reimbursableFormatted },
    items.unbilledFormatted !== "£0.00"
      ? { href: "/orders", label: "Orders still to invoice", value: items.unbilledFormatted }
      : null,
    items.recurringUpcomingFormatted !== "£0.00"
      ? { href: "/recurring-invoices", label: "Recurring each month", value: items.recurringUpcomingFormatted }
      : null,
    items.winRatePercent != null
      ? { href: "/quotes", label: "Quotes won", value: `${items.winRatePercent}%` }
      : null,
    items.dsoDays != null
      ? { href: "/invoices", label: "Average days to get paid", value: String(items.dsoDays) }
      : null,
  ].filter((stat) => stat != null);

  return (
    <Card className={cn("h-full", className)}>
      <CardTitle>Needs attention</CardTitle>

      {urgentCount === 0 ? (
        <p className="mt-2 text-sm">Nothing needs your attention.</p>
      ) : (
        <div className="mt-3 divide-y divide-border">
          {items.overdueInvoices.length > 0 ? (
            <Group title="Overdue invoices" count={items.overdueInvoices.length} urgent>
              {items.overdueInvoices.map((invoice) => (
                <Row
                  key={invoice.id}
                  href={`/invoices/${invoice.id}`}
                  primary={invoice.number}
                  secondary={invoice.clientName}
                  amount={invoice.balanceFormatted}
                  amountClassName="text-destructive"
                />
              ))}
            </Group>
          ) : null}

          {items.inboundEmailIssues.length > 0 ? (
            <Group title="Emails that couldn't be read" count={items.inboundEmailIssues.length} urgent>
              {items.inboundEmailIssues.map((job) => (
                <Row
                  key={job.id}
                  href={`/inbound-email/${job.id}`}
                  primary={job.subject || "(no subject)"}
                  secondary={job.fromEmail}
                />
              ))}
            </Group>
          ) : null}

          {items.expiringQuotes.length > 0 ? (
            <Group title="Quotes expiring" count={items.expiringQuotes.length}>
              {items.expiringQuotes.map((quote) => (
                <Row
                  key={quote.id}
                  href={`/quotes/${quote.id}`}
                  primary={quote.number}
                  secondary={quote.clientName}
                  amount={
                    <>
                      Until <DisplayDate value={quote.validUntil} />
                    </>
                  }
                  amountClassName="text-muted"
                />
              ))}
            </Group>
          ) : null}

          {items.pendingExpensesCount > 0 ? (
            <Group title="Expenses to review" count={items.pendingExpensesCount}>
              {items.pendingExpenses.map((expense) => (
                <Row
                  key={expense.id}
                  href={`/expenses/${expense.id}`}
                  primary={expense.description}
                  secondary={expense.submitterLabel}
                  amount={expense.amountFormatted}
                />
              ))}
            </Group>
          ) : null}

          {items.unreconciledCount > 0 ? (
            <Group title="Bank transactions to match" count={items.unreconciledCount}>
              <Row
                href="/transactions"
                primary={
                  items.unreconciledCount === 1
                    ? "1 transaction isn't matched yet"
                    : `${items.unreconciledCount} transactions aren't matched yet`
                }
              />
            </Group>
          ) : null}
        </div>
      )}

      {stats.length > 0 ? (
        <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-4 text-sm sm:grid-cols-3">
          {stats.map((stat) => (
            <li key={stat.label}>
              <Link href={stat.href} className="-mx-2 block rounded-xl px-2 py-1 hover:bg-wash">
                <span className="block text-xs text-muted">{stat.label}</span>
                <span className="block tabular-nums">{stat.value}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
