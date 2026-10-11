import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardTitle, CardValue } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatIsoDateUk } from "@/lib/dates";
import { formatGBP } from "@/lib/money";
import type { Margin } from "@/lib/profitability/rebill";
import type { ProjectExpense } from "@/lib/profitability/queries";

export function marginLabel(m: Margin): string {
  return m.marginPercent == null ? "—" : `${m.marginPercent}%`;
}

/** Revenue, costs and margin as a row of cards. */
export function MarginCards({
  revenueLabel,
  margin,
  extra,
}: {
  revenueLabel: string;
  margin: Margin;
  extra?: { title: string; value: string; note?: string };
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardTitle>{revenueLabel}</CardTitle>
        <CardValue>{formatGBP(margin.revenuePence)}</CardValue>
      </Card>
      <Card>
        <CardTitle>Costs</CardTitle>
        <CardValue>{formatGBP(margin.costPence)}</CardValue>
      </Card>
      <Card>
        <CardTitle>Margin</CardTitle>
        <CardValue className={margin.marginPence < 0 ? "text-red-700 dark:text-red-400" : undefined}>
          {formatGBP(margin.marginPence)}
        </CardValue>
        <p className="mt-2 text-xs text-muted">{marginLabel(margin)} of revenue</p>
      </Card>
      {extra ? (
        <Card>
          <CardTitle>{extra.title}</CardTitle>
          <CardValue>{extra.value}</CardValue>
          {extra.note ? <p className="mt-2 text-xs text-muted">{extra.note}</p> : null}
        </Card>
      ) : null}
    </div>
  );
}

/** Expenses tagged to an order or client, and whether each was recharged. */
export function ProjectExpenses({
  expenses,
  addHref,
  canWrite,
  showOrder = false,
}: {
  expenses: ProjectExpense[];
  addHref: string;
  canWrite: boolean;
  showOrder?: boolean;
}) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">Costs</h2>
        {canWrite ? (
          <Link href={addHref} className={buttonClasses("secondary")}>
            Add a cost
          </Link>
        ) : null}
      </div>
      {expenses.length === 0 ? (
        <p className="text-sm text-muted">
          No expenses tagged here yet. Tag an expense to this {showOrder ? "client" : "order"} to see
          the margin.
        </p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Expense</TH>
              {showOrder ? <TH>Order</TH> : null}
              <TH>Rebill</TH>
              <TH className="text-right">Cost (net)</TH>
            </TR>
          </THead>
          <TBody>
            {expenses.map((e) => (
              <TR key={e.id}>
                <TD>
                  <Link href={`/expenses/${e.id}`} className="font-medium text-foreground hover:underline">
                    {e.description}
                  </Link>
                  {e.spentAt ? (
                    <span className="ml-2 text-xs text-muted">{formatIsoDateUk(e.spentAt)}</span>
                  ) : null}
                </TD>
                {showOrder ? <TD className="text-muted">{e.orderNumber ?? "—"}</TD> : null}
                <TD className="text-muted">
                  {e.rebilledOn ? (
                    <Link href={`/invoices/${e.rebilledOn.invoiceId}`} className="hover:underline">
                      On {e.rebilledOn.number}
                    </Link>
                  ) : e.billable ? (
                    "Not invoiced yet"
                  ) : (
                    "—"
                  )}
                </TD>
                <TD className="text-right">{formatGBP(e.costPence)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </section>
  );
}
