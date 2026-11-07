import Link from "next/link";
import { guardTenantPage } from "@/lib/auth";
import { can } from "@/lib/roles";
import { QueryCell, QueryHeaderCell } from "@/components/queries/query-cells";
import { recordQueriesFor } from "@/lib/queries/queries";
import { recordScopeFor } from "@/lib/accountant/record-scope";
import { listCreditNotes } from "@/lib/credit-notes/queries";
import { CreditNoteStatusBadge } from "@/components/credit-notes/credit-note-status-badge";
import { BackLink } from "@/components/ui/back-link";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TD } from "@/components/ui/table";
import { sortHeaders } from "@/components/ui/sortable-th";
import { defineTableSort, parseTableSort, rankIn, sortRows } from "@/lib/table-sort";
import { DisplayDate } from "@/components/date-format-provider";

/** "created" is the loaded order (newest first) and has no header. */
const SORT = defineTableSort({
  columns: ["created", "number", "client", "invoice", "status", "issued", "total"],
  fallback: { sort: "created", dir: "desc" },
  descFirst: ["created", "issued", "total"],
});

export default async function CreditNotesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { companyId, role } = await guardTenantPage("records:read");
  const canRaiseQuery = can(role, "queries:raise");
  const sp = await searchParams;
  const sort = parseTableSort(sp, SORT);
  const th = sortHeaders("/credit-notes", sp, SORT, sort);
  const rows = sortRows(await listCreditNotes(companyId, recordScopeFor(role)), sort, {
    number: (r) => r.number,
    client: (r) => r.clientName,
    invoice: (r) => r.invoiceNumber,
    status: (r) => rankIn(["issued", "void"], r.status),
    issued: (r) => r.issueDate,
    total: (r) => r.grossPence,
  });
  const queries = await recordQueriesFor(role, companyId, "credit_note", rows.map((r) => r.id));
  const showQueries = canRaiseQuery || queries.size > 0;

  return (
    <div>
      <div className="mb-6">
        <BackLink href="/invoices">Invoices</BackLink>
      </div>
      <h1 className="font-display text-2xl font-semibold">Credit notes</h1>
      <p className="mt-1 text-muted">
        Corrections and refunds against invoices you&apos;ve already sent.
      </p>

      <div className="mt-6">
        {rows.length === 0 ? (
          <EmptyState
            title="No credit notes yet"
            description="To credit all or part of an invoice, open it and choose Raise credit note."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                {showQueries ? <QueryHeaderCell /> : null}
                {th("Number", "number")}
                {th("Client", "client")}
                {th("Invoice", "invoice")}
                {th("Status", "status")}
                {th("Issue date", "issued")}
                {th("Total", "total", "end")}
              </TR>
            </THead>
            <TBody>
              {rows.map((cn) => (
                <TR key={cn.id}>
                  {showQueries ? (
                    <QueryCell kind="credit_note" id={cn.id} queries={queries.get(cn.id)} canRaise={canRaiseQuery} />
                  ) : null}
                  <TD>
                    <Link href={`/credit-notes/${cn.id}`} className="font-medium hover:underline">
                      {cn.number}
                    </Link>
                  </TD>
                  <TD>{cn.clientName}</TD>
                  <TD>
                    <Link href={`/invoices/${cn.invoiceId}`} className="hover:underline">
                      {cn.invoiceNumber}
                    </Link>
                  </TD>
                  <TD>
                    <CreditNoteStatusBadge status={cn.status} />
                  </TD>
                  <TD><DisplayDate value={cn.issueDate} /></TD>
                  <TD className="text-right">{cn.grossFormatted}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </div>
  );
}
