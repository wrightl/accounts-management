import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { guardPage, hasPermission } from "@/lib/auth";
import { getClientOverview } from "@/lib/clients/overview";
import { clientDisplayName } from "@/lib/clients/display";
import { ClientSummaryPanel } from "@/components/clients/client-summary";
import { InvoiceDueDate } from "@/components/invoices/invoice-due-date";
import { StatusBadge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { isDatabaseConfigured } from "@/env";
import type { InvoiceStatus } from "@/lib/invoices/status";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await guardPage("accounts:read");
  const canWrite = await hasPermission("accounts:write");
  const { id } = await params;

  if (!isDatabaseConfigured()) notFound();

  const overview = await getClientOverview(id);
  if (!overview) notFound();

  const { client, quotes, orders, invoiceRows, metrics, quoteStatusBreakdown } = overview;

  return (
    <div>
      <div className="mb-6">
        <Link href="/dashboard/clients" className={buttonClasses("ghost")}>
          ← Clients
        </Link>
      </div>

      <div className="flex items-center gap-2">
        <h1 className="font-display text-2xl font-semibold">{clientDisplayName(client)}</h1>
        {canWrite ? (
          <Link
            href={`/dashboard/clients/${client.id}/edit`}
            className={buttonClasses("ghost", "size-9 shrink-0 px-0")}
            aria-label="Edit client"
          >
            <Pencil className="h-4 w-4" />
          </Link>
        ) : null}
      </div>
      {client.companyName && client.companyName !== client.name ? (
        <p className="mt-1 text-muted">
          {client.name}
          {client.email ? ` · ${client.email}` : ""}
        </p>
      ) : client.email ? (
        <p className="mt-1 text-muted">{client.email}</p>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_280px] xl:grid-cols-[1fr_320px]">
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 font-display text-lg font-semibold">Quotes</h2>
            {quotes.length === 0 ? (
              <p className="text-sm text-muted">No quotes for this client.</p>
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
                          href={`/dashboard/quotes/${q.id}`}
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
              <p className="text-sm text-muted">No orders for this client.</p>
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
                          href={`/dashboard/orders/${o.id}`}
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
              <p className="text-sm text-muted">No invoices for this client.</p>
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
                          href={`/dashboard/invoices/${inv.id}`}
                          className="font-medium text-foreground hover:underline"
                        >
                          {inv.number}
                        </Link>
                      </TD>
                      <TD>
                        <StatusBadge status={inv.status as InvoiceStatus} />
                      </TD>
                      <TD className="text-muted">{inv.issueDate ?? "—"}</TD>
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
