import Link from "next/link";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import { listInvoices } from "@/lib/invoices/queries";
import { InvoiceImportButton } from "@/components/invoices/invoice-import-panel";
import { buttonClasses } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { InvoiceDueDate } from "@/components/invoices/invoice-due-date";
import { Table, THead, TBody, TR, TD } from "@/components/ui/table";
import { sortHeaders } from "@/components/ui/sortable-th";
import type { InvoiceStatus } from "@/lib/invoices/status";
import { defineTableSort, parseTableSort, rankIn, sortRows } from "@/lib/table-sort";

/** "created" is the loaded order (newest first) and has no header. */
const SORT = defineTableSort({
  columns: ["created", "number", "client", "order", "status", "issued", "due", "total"],
  fallback: { sort: "created", dir: "desc" },
  descFirst: ["created", "issued", "total"],
});
const STATUS_ORDER: InvoiceStatus[] = ["draft", "sent", "overdue", "paid", "void"];

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { companyId } = await guardTenantPage("accounts:read");
  const canWrite = await hasPermission("accounts:write");
  const sp = await searchParams;
  const sort = parseTableSort(sp, SORT);
  const th = sortHeaders("/invoices", sp, SORT, sort);

  const rows = sortRows(await listInvoices(companyId), sort, {
    number: (r) => r.number,
    client: (r) => r.clientName,
    order: (r) => r.orderNumber,
    status: (r) => rankIn(STATUS_ORDER, r.status),
    issued: (r) => r.issueDate,
    due: (r) => r.dueDate,
    total: (r) => r.grossPence,
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Invoices</h1>
          <p className="mt-1 text-muted">Create, send and track client invoices.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/credit-notes" className={buttonClasses("ghost")}>
            Credit notes
          </Link>
          {canWrite ? (
            <>
              <InvoiceImportButton canWrite={canWrite} />
              <Link href="/invoices/new" className={buttonClasses("primary")}>
                New invoice
              </Link>
            </>
          ) : null}
        </div>
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
                {th("Number", "number")}
                {th("Client", "client")}
                {th("Order", "order")}
                {th("Status", "status")}
                {th("Issue date", "issued")}
                {th("Due", "due")}
                {th("Total", "total", "end")}
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
