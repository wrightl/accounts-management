import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import { getClientOverview } from "@/lib/clients/overview";
import { clientDisplayName } from "@/lib/clients/display";
import { ClientSummaryPanel } from "@/components/clients/client-summary";
import { InvoiceDueDate } from "@/components/invoices/invoice-due-date";
import { StatusBadge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import type { InvoiceStatus } from "@/lib/invoices/status";
import { formatGBP } from "@/lib/money";
import { listClientProfitability, listProjectExpenses } from "@/lib/profitability/queries";
import { MarginCards, ProjectExpenses } from "@/components/profitability/project-costs";
import { DisplayDate } from "@/components/date-format-provider";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { companyId } = await guardTenantPage("accounts:read");
  const canWrite = await hasPermission("accounts:write");
  const { id } = await params;

  const [overview, profitRows, costs, company] = await Promise.all([
    getClientOverview(companyId, id),
    listClientProfitability(companyId, { from: null, to: null }, id),
    listProjectExpenses(companyId, { clientId: id }),
    getOrCreateCompanySettings(companyId),
  ]);
  if (!overview) notFound();
  const profit = profitRows[0];

  const { client, quotes, orders, invoiceRows, metrics, quoteStatusBreakdown } = overview;

  return (
    <div>
      <PageHeader
        backHref="/clients"
        backLabel="Clients"
        title={clientDisplayName(client)}
        titleAddon={
          canWrite ? (
            <Link
              href={`/clients/${client.id}/edit`}
              className={buttonClasses("ghost", "size-9 shrink-0 px-0")}
              aria-label="Edit client"
            >
              <Pencil className="h-4 w-4" />
            </Link>
          ) : null
        }
        description={
          client.companyName && client.companyName !== client.name ? (
            <>
              {client.name}
              {client.email ? ` · ${client.email}` : ""}
            </>
          ) : (
            client.email || undefined
          )
        }
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_280px] xl:grid-cols-[1fr_320px]">
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 font-display text-lg font-semibold">Quotes</h2>
            {quotes.length === 0 ? (
              <EmptyState description="No quotes for this client." />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Number</TH>
                    <TH>Version</TH>
                    <TH>Status</TH>
                    <TH className="text-right">Total</TH>
                  </TR>
                </THead>
                <TBody>
                  {quotes.map((q) => (
                    <TR key={q.id}>
                      <TD>
                        <Link
                          href={`/quotes/${q.id}`}
                          className="font-medium text-foreground hover:underline"
                        >
                          {q.number}
                        </Link>
                      </TD>
                      <TD className="text-muted">{q.versionLabel}</TD>
                      <TD>{q.statusLabel}</TD>
                      <TD className="text-right">{q.grossFormatted}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </section>

          <section>
            <h2 className="mb-3 font-display text-lg font-semibold">Orders</h2>
            {orders.length === 0 ? (
              <EmptyState description="No orders for this client." />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Number</TH>
                    <TH>Status</TH>
                    <TH className="text-right">Total</TH>
                  </TR>
                </THead>
                <TBody>
                  {orders.map((o) => (
                    <TR key={o.id}>
                      <TD>
                        <Link
                          href={`/orders/${o.id}`}
                          className="font-medium text-foreground hover:underline"
                        >
                          {o.number}
                        </Link>
                      </TD>
                      <TD className="capitalize">{o.status}</TD>
                      <TD className="text-right">{o.grossFormatted}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </section>

          <section>
            <h2 className="mb-3 font-display text-lg font-semibold">Invoices</h2>
            {invoiceRows.length === 0 ? (
              <EmptyState description="No invoices for this client." />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Number</TH>
                    <TH>Status</TH>
                    <TH>Issued</TH>
                    <TH>Due</TH>
                    <TH className="text-right">Total</TH>
                  </TR>
                </THead>
                <TBody>
                  {invoiceRows.map((inv) => (
                    <TR key={inv.id}>
                      <TD>
                        <Link
                          href={`/invoices/${inv.id}`}
                          className="font-medium text-foreground hover:underline"
                        >
                          {inv.number}
                        </Link>
                      </TD>
                      <TD>
                        <StatusBadge status={inv.status as InvoiceStatus} />
                      </TD>
                      <TD className="text-muted"><DisplayDate value={inv.issueDate} /></TD>
                      <TD>
                        <InvoiceDueDate
                          dueDate={inv.dueDate}
                          status={inv.status as InvoiceStatus}
                        />
                      </TD>
                      <TD className="text-right">{inv.grossFormatted}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </section>

          {profit ? (
            <section>
              <h2 className="mb-3 font-display text-lg font-semibold">Profitability</h2>
              <MarginCards
                revenueLabel="Invoiced (all time)"
                margin={profit}
                extra={
                  profit.unbilledRebillablePence > 0
                    ? {
                        title: "Rebillable, not invoiced",
                        value: formatGBP(profit.unbilledRebillablePence),
                        note: "Add it from the client's next invoice",
                      }
                    : undefined
                }
              />
              <p className="mt-2 text-xs text-muted">
                {company.vatRegistered ? "Net of VAT and credit notes." : "Net of credit notes."} Costs
                are expenses tagged to this client or their orders.
              </p>
            </section>
          ) : null}

          <ProjectExpenses
            expenses={costs}
            addHref={`/expenses/new?clientId=${id}`}
            canWrite={canWrite}
            showOrder
          />
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <ClientSummaryPanel
            metrics={metrics}
            client={client}
            quoteStatusBreakdown={quoteStatusBreakdown}
          />
        </aside>
      </div>
    </div>
  );
}
