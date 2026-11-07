import Link from "next/link";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import { can } from "@/lib/roles";
import { QueryCell, QueryHeaderCell } from "@/components/queries/query-cells";
import { recordQueriesFor } from "@/lib/queries/queries";
import { UnchasedImportsBanner } from "@/components/invoices/imported-invoice-chase";
import { OpenImportsBanner } from "@/components/invoices/open-imports-banner";
import { getOpenImports } from "@/lib/invoices/import/queries";
import { recordScopeFor } from "@/lib/accountant/record-scope";
import { getUnchasedImports, listInvoicePage } from "@/lib/invoices/queries";
import { buttonClasses } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { InvoiceDueDate } from "@/components/invoices/invoice-due-date";
import { Table, THead, TBody, TR, TD } from "@/components/ui/table";
import { sortHeaders } from "@/components/ui/sortable-th";
import type { InvoiceStatus } from "@/lib/invoices/status";
import {
  INVOICE_SORT,
  hasActiveInvoiceFilters,
  invoiceListHref,
  invoiceListSearchParams,
  parseInvoiceListParams,
  resolveInvoiceListDateRange,
} from "@/lib/invoices/list-params";
import { InvoiceFilters } from "@/components/invoices/invoice-filters";
import { ListPagination } from "@/components/ui/list-pagination";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { listClients } from "@/lib/clients/queries";
import { DisplayDate } from "@/components/date-format-provider";
import { PageHeader } from "@/components/ui/page-header";

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
  const params = parseInvoiceListParams(sp);
  const showImports = scope === "all";
  const [unchased, openImports, settings, clientRows] = await Promise.all([
    showImports ? getUnchasedImports(companyId) : null,
    showImports && canWrite ? getOpenImports(companyId) : [],
    getOrCreateCompanySettings(companyId),
    listClients(companyId),
  ]);
  const dateRange = resolveInvoiceListDateRange(params, settings.financialYearEndMonth);
  const filtered = hasActiveInvoiceFilters(params);

  const { rows, total, page, pageSize, pageCount } = await listInvoicePage(companyId, {
    q: params.q,
    status: params.status,
    client: params.client,
    from: dateRange.from,
    to: dateRange.to,
    page: params.page,
    pageSize: params.pageSize,
    sort: params.sort,
    dir: params.dir,
    scope,
  });
  // Sorting goes back to the first page.
  const th = sortHeaders(
    "/invoices",
    Object.fromEntries(invoiceListSearchParams(params, { page: 1 })),
    INVOICE_SORT,
    { sort: params.sort, dir: params.dir },
  );
  const clientOptions = clientRows
    .map((c) => ({ id: c.id, label: c.companyName || c.name }))
    .sort((a, b) => a.label.localeCompare(b.label, "en-GB", { sensitivity: "base" }));
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

      <div className="mt-4">
        <InvoiceFilters
          params={params}
          clients={clientOptions}
          showDraftAndVoid={scope === "all"}
        />
      </div>

      <div className="mt-6">
        {rows.length === 0 ? (
          filtered ? (
            <p className="text-sm text-muted">No invoices match these filters.</p>
          ) : (
            <EmptyState
              title="No invoices yet"
              description="Create an invoice to bill a client, or convert an accepted quote into an order first."
              actionHref={canWrite ? "/invoices/new" : undefined}
              actionLabel={canWrite ? "Create an invoice" : undefined}
            />
          )
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
        <ListPagination
          total={total}
          page={page}
          pageSize={pageSize}
          pageCount={pageCount}
          href={(to) => invoiceListHref(params, to as Partial<typeof params>)}
        />
      </div>
    </div>
  );
}
