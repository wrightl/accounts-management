import Link from "next/link";
import { guardPage, hasPermission } from "@/lib/auth";
import { listInvoices } from "@/lib/invoices/queries";
import { buttonClasses } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { InvoiceDueDate } from "@/components/invoices/invoice-due-date";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { isDatabaseConfigured } from "@/env";
import type { InvoiceStatus } from "@/lib/invoices/status";

export default async function InvoicesPage() {
  await guardPage("accounts:read");
  const canWrite = await hasPermission("accounts:write");

  if (!isDatabaseConfigured()) {
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold">Invoices</h1>
        <p className="mt-2 text-muted">Connect a database to manage invoices.</p>
      </div>
    );
  }

  const rows = await listInvoices();

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Invoices</h1>
          <p className="mt-1 text-muted">Create, send and track client invoices.</p>
        </div>
        {canWrite && (
          <Link href="/dashboard/invoices/new" className={buttonClasses("primary")}>
            New invoice
          </Link>
        )}
      </div>

      <div className="mt-6">
        {rows.length === 0 ? (
          <p className="text-sm text-muted">No invoices yet.</p>
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
                      href={`/dashboard/invoices/${inv.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {inv.number}
                    </Link>
                  </TD>
                  <TD>{inv.clientName}</TD>
                  <TD>
                    {inv.orderId && inv.orderNumber ? (
                      <Link
                        href={`/dashboard/orders/${inv.orderId}`}
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
