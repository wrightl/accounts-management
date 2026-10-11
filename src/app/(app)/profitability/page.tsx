import type { Metadata } from "next";
import Link from "next/link";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import { todayIsoDate } from "@/lib/dates";
import { formatGBP } from "@/lib/money";
import { profitabilityPeriod } from "@/lib/profitability/period";
import { listClientProfitability, listOrderProfitability } from "@/lib/profitability/queries";
import type { Margin } from "@/lib/profitability/rebill";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { marginLabel } from "@/components/profitability/project-costs";
import { cn } from "@/lib/utils";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

export const metadata: Metadata = { title: "Profitability" };

const PERIODS = [
  { key: "fy", label: "This financial year" },
  { key: "last", label: "Last financial year" },
  { key: "all", label: "All time" },
] as const;

function MarginCell({ m }: { m: Margin }) {
  return (
    <TD className={cn("text-right", m.marginPence < 0 && "text-red-700 dark:text-red-400")}>
      {formatGBP(m.marginPence)}
      <span className="ml-2 text-xs text-muted">{marginLabel(m)}</span>
    </TD>
  );
}

export default async function ProfitabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { companyId } = await guardTenantPage("reports:read");
  const canWrite = await hasPermission("accounts:write");
  const company = await getOrCreateCompanySettings(companyId);
  const period = profitabilityPeriod(
    (await searchParams).period,
    company.financialYearEndMonth,
    todayIsoDate(),
  );
  const [orders, clients] = await Promise.all([
    listOrderProfitability(companyId),
    listClientProfitability(companyId, period),
  ]);
  const activeOrders = orders.filter(
    (o) => o.status !== "draft" && !(o.status === "cancelled" && o.current.revenuePence === 0),
  );
  const toRebill = clients.filter((c) => c.unbilledRebillablePence > 0);
  const anyCosts =
    orders.some((o) => o.current.costPence > 0) || clients.some((c) => c.costPence > 0);

  return (
    <div className="max-w-5xl">
      <h1 className="font-display text-2xl font-semibold">Profitability</h1>
      <p className="mt-1 text-muted">
        What each order and client earns once the costs you spent on them are taken off. All
        figures are net of VAT.
      </p>

      {!anyCosts ? (
        <p className="mt-6 rounded-xl bg-wash px-4 py-3 text-sm">
          No costs are tagged yet, so every margin is 100%. Open an expense and choose its client
          or order, or use <span className="font-medium">Add a cost</span> on an order.
        </p>
      ) : null}

      {toRebill.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-3 font-display text-lg font-semibold">Rebillable costs to invoice</h2>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {toRebill.map((c) => (
              <li key={c.clientId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <span>{c.clientName}</span>
                <span className="flex items-center gap-4">
                  <span className="tabular-nums">{formatGBP(c.unbilledRebillablePence)}</span>
                  {canWrite ? (
                    <Link
                      href={`/invoices/new?clientId=${c.clientId}`}
                      className="font-medium text-foreground underline-offset-2 hover:underline"
                    >
                      New invoice →
                    </Link>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="mb-1 font-display text-lg font-semibold">By order</h2>
        <p className="mb-3 text-sm text-muted">
          Revenue so far is invoiced on the order, less credit notes, plus its costs recharged on
          other invoices. Projected assumes the rest of the order and its rebillable costs get
          invoiced.
        </p>
        {activeOrders.length === 0 ? (
          <p className="text-sm text-muted">No orders yet.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Order</TH>
                <TH>Client</TH>
                <TH className="text-right">Quoted</TH>
                <TH className="text-right">Revenue so far</TH>
                <TH className="text-right">Costs</TH>
                <TH className="text-right">Margin</TH>
                <TH className="text-right">Projected</TH>
              </TR>
            </THead>
            <TBody>
              {activeOrders.map((o) => (
                <TR key={o.orderId}>
                  <TD>
                    <Link href={`/orders/${o.orderId}`} className="font-medium text-foreground hover:underline">
                      {o.number}
                    </Link>
                    {o.status !== "active" ? (
                      <span className="ml-2 text-xs capitalize text-muted">{o.status}</span>
                    ) : null}
                  </TD>
                  <TD className="text-muted">{o.clientName}</TD>
                  <TD className="text-right">{formatGBP(o.quotedPence)}</TD>
                  <TD className="text-right">{formatGBP(o.current.revenuePence)}</TD>
                  <TD className="text-right">{formatGBP(o.current.costPence)}</TD>
                  <MarginCell m={o.current} />
                  <MarginCell m={o.projected} />
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>

      <section className="mt-10">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="mb-1 font-display text-lg font-semibold">By client</h2>
            <p className="text-sm text-muted">
              Invoiced less credit notes, against expenses tagged to the client or their orders.
            </p>
          </div>
          <nav className="flex gap-1 text-sm" aria-label="Period">
            {PERIODS.map((p) => (
              <Link
                key={p.key}
                href={p.key === "fy" ? "/profitability" : `/profitability?period=${p.key}`}
                aria-current={period.key === p.key ? "page" : undefined}
                className={cn(
                  "rounded-full px-3 py-1",
                  period.key === p.key ? "bg-foreground text-background" : "text-muted hover:bg-wash",
                )}
              >
                {p.label}
              </Link>
            ))}
          </nav>
        </div>
        {clients.length === 0 ? (
          <p className="text-sm text-muted">No invoices or tagged costs in this period.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Client</TH>
                <TH className="text-right">Revenue</TH>
                <TH className="text-right">Costs</TH>
                <TH className="text-right">Margin</TH>
              </TR>
            </THead>
            <TBody>
              {clients.map((c) => (
                <TR key={c.clientId}>
                  <TD>
                    <Link href={`/clients/${c.clientId}`} className="font-medium text-foreground hover:underline">
                      {c.clientName}
                    </Link>
                  </TD>
                  <TD className="text-right">{formatGBP(c.revenuePence)}</TD>
                  <TD className="text-right">{formatGBP(c.costPence)}</TD>
                  <MarginCell m={c} />
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>
    </div>
  );
}
