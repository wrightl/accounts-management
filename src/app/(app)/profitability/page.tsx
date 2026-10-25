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
import { Table, THead, TBody, TR, TD } from "@/components/ui/table";
import { sortHeaders } from "@/components/ui/sortable-th";
import { defineTableSort, parseTableSort, setTableSortParams, sortRows } from "@/lib/table-sort";

/** "created" is the loaded order (newest first) and has no header. */
const ORDER_SORT = defineTableSort({
  columns: ["created", "order", "client", "quoted", "revenue", "costs", "margin", "projected"],
  fallback: { sort: "created", dir: "desc" },
  descFirst: ["created", "quoted", "revenue", "costs", "margin", "projected"],
});
/** The client table has its own params (csort/cdir) so both sort independently. */
const CLIENT_SORT = defineTableSort({
  columns: ["client", "revenue", "costs", "margin"],
  fallback: { sort: "revenue", dir: "desc" },
  descFirst: ["revenue", "costs", "margin"],
  prefix: "c",
});

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
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const orderSort = parseTableSort(sp, ORDER_SORT);
  const clientSort = parseTableSort(sp, CLIENT_SORT);
  const orderTh = sortHeaders("/profitability", sp, ORDER_SORT, orderSort);
  const clientTh = sortHeaders("/profitability", sp, CLIENT_SORT, clientSort);
  /** Period links keep both tables' sorts. */
  const periodHref = (key: string) => {
    const qs = new URLSearchParams(key === "fy" ? {} : { period: key });
    setTableSortParams(qs, ORDER_SORT, orderSort);
    setTableSortParams(qs, CLIENT_SORT, clientSort);
    const query = qs.toString();
    return query ? `/profitability?${query}` : "/profitability";
  };
  const { companyId } = await guardTenantPage("reports:read");
  const canWrite = await hasPermission("accounts:write");
  const company = await getOrCreateCompanySettings(companyId);
  const period = profitabilityPeriod(
    sp.period,
    company.financialYearEndMonth,
    todayIsoDate(),
  );
  const [orders, loadedClients] = await Promise.all([
    listOrderProfitability(companyId),
    listClientProfitability(companyId, period),
  ]);
  const activeOrders = sortRows(
    orders.filter(
      (o) => o.status !== "draft" && !(o.status === "cancelled" && o.current.revenuePence === 0),
    ),
    orderSort,
    {
      order: (o) => o.number,
      client: (o) => o.clientName,
      quoted: (o) => o.quotedPence,
      revenue: (o) => o.current.revenuePence,
      costs: (o) => o.current.costPence,
      margin: (o) => o.current.marginPence,
      projected: (o) => o.projected.marginPence,
    },
  );
  const clients = sortRows(loadedClients, clientSort, {
    client: (c) => c.clientName,
    revenue: (c) => c.revenuePence,
    costs: (c) => c.costPence,
    margin: (c) => c.marginPence,
  });
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
                {orderTh("Order", "order")}
                {orderTh("Client", "client")}
                {orderTh("Quoted", "quoted", "end")}
                {orderTh("Revenue so far", "revenue", "end")}
                {orderTh("Costs", "costs", "end")}
                {orderTh("Margin", "margin", "end")}
                {orderTh("Projected", "projected", "end")}
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
                href={periodHref(p.key)}
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
                {clientTh("Client", "client")}
                {clientTh("Revenue", "revenue", "end")}
                {clientTh("Costs", "costs", "end")}
                {clientTh("Margin", "margin", "end")}
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
