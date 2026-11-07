import Link from "next/link";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import { can } from "@/lib/roles";
import { QueryCell, QueryHeaderCell } from "@/components/queries/query-cells";
import { recordQueriesFor } from "@/lib/queries/queries";
import { UnchasedImportsBanner } from "@/components/invoices/imported-invoice-chase";
import { OpenImportsBanner } from "@/components/invoices/open-imports-banner";
import { getOpenImports } from "@/lib/invoices/import/queries";
import { recordScopeFor } from "@/lib/accountant/record-scope";
import { getUnchasedImports, listInvoices } from "@/lib/invoices/queries";
import { buttonClasses } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { InvoiceDueDate } from "@/components/invoices/invoice-due-date";
import { Table, THead, TBody, TR, TD } from "@/components/ui/table";
import { sortHeaders } from "@/components/ui/sortable-th";
import type { InvoiceStatus } from "@/lib/invoices/status";
import { defineTableSort, parseTableSort, rankIn, sortRows } from "@/lib/table-sort";
import { DisplayDate } from "@/components/date-format-provider";
import { PageHeader } from "@/components/ui/page-header";

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
  const { companyId, role } = await guardTenantPage("records:read");
  const scope = recordScopeFor(role);
  const canWrite = await hasPermission("accounts:write");
  const canRaiseQuery = can(role, "queries:raise");
  const sp = await searchParams;
  const showImports = scope === "all";
  const [unchased, openImports] = await Promise.all([
    showImports ? getUnchasedImports(companyId) : null,
    showImports && canWrite ? getOpenImports(companyId) : [],
  ]);
  const sort = parseTableSort(sp, SORT);
  const th = sortHeaders("/invoices", sp, SORT, sort);

  const rows = sortRows(await listInvoices(companyId, scope), sort, {
    number: (r) => r.number,
    client: (r) => r.clientName,
    order: (r) => r.orderNumber,
    status: (r) => rankIn(STATUS_ORDER, r.status),
    issued: (r) => r.issueDate,
    due: (r) => r.dueDate,
    total: (r) => r.grossPence,
  });
  const queries = await recordQueriesFor(role, companyId, "invoice", rows.map((r) => r.id));
  const showQueries = canRaiseQuery || queries.size > 0;

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Create, send and track client invoices."
        actions={
          <>
            <Link href="/credit-notes" className={buttonClasses("ghost")}>
              Credit notes
            </Link>
            {canWrite ? (
              <>
                <Link href="/invoices/import" className={buttonClasses("ghost")}>
                  Imports
                </Link>
                <Link href="/invoices/new" className={buttonClasses("primary")}>
                  New invoice
                </Link>
              </>
            ) : null}
          </>
        }
      />

      <OpenImportsBanner imports={openImports} />

      {unchased && unchased.count > 0 ? (
        <UnchasedImportsBanner
          count={unchased.count}
          totalFormatted={unchased.totalFormatted}
          withoutEmail={unchased.withoutEmail}
          canWrite={canWrite}
        />
      ) : null}

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
                {showQueries ? <QueryHeaderCell /> : null}
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
                  {showQueries ? (
                    <QueryCell kind="invoice" id={inv.id} queries={queries.get(inv.id)} canRaise={canRaiseQuery} />
                  ) : null}
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
                    {inv.orderId && inv.orderNumber && scope === "all" ? (
                      <Link
                        href={`/orders/${inv.orderId}`}
                        className="text-foreground hover:underline"
                      >
                        {inv.orderNumber}
                      </Link>
                    ) : (
                      <span className="text-muted">{inv.orderNumber ?? "—"}</span>
                    )}
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
