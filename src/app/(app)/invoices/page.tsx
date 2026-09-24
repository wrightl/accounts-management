import Link from "next/link";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import { listInvoices } from "@/lib/invoices/queries";
import { buttonClasses } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { InvoiceDueDate } from "@/components/invoices/invoice-due-date";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import type { InvoiceStatus } from "@/lib/invoices/status";

export default async function InvoicesPage() {
  const { companyId } = await guardTenantPage("accounts:read");
  const canWrite = await hasPermission("accounts:write");

  const rows = await listInvoices(companyId);

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Invoices</h1>
          <p className="mt-1 text-muted">Create, send and track client invoices.</p>
        </div>
        {canWrite && (
          <Link href="/invoices/new" className={buttonClasses("primary")}>
            New invoice
          </Link>
        )}
      </div>

      <div className="mt-6">
        {rows.length === 0 ? (
          <EmptyState
            title="No invoices yet"
            description="Create an invoice to bill a client, or convert an accepted quote into an order first."
            actionHref={canWrite ? "/invoices/new" : undefined}
            actionLabel={canWrite ? "Create an invoice" : undefined}
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Number</TH>
                <TH>Client</TH>
                <TH>Order</TH>
                <TH>Status</TH>
                <TH>Issue date</TH>
                <TH>Due</TH>
                <TH className="text-right">Total</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((inv) => (
                <TR key={inv.id}>
                  <TD>
                    <Link
                      href={`/invoices/${inv.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {inv.number}
                    </Link>
                  </TD>
                  <TD>{inv.clientName}</TD>
                  <TD>
                    {inv.orderId && inv.orderNumber ? (
                      <Link
                        href={`/orders/${inv.orderId}`}
                        className="text-foreground hover:underline"
                      >
                        {inv.orderNumber}
                      </Link>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
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
                  <TD className="text-right font-medium">{inv.grossFormatted}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </div>
  );
}
