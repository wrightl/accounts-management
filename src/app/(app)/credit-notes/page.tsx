import Link from "next/link";
import { guardTenantPage } from "@/lib/auth";
import { listCreditNotes } from "@/lib/credit-notes/queries";
import { CreditNoteStatusBadge } from "@/components/credit-notes/credit-note-status-badge";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TD } from "@/components/ui/table";
import { sortHeaders } from "@/components/ui/sortable-th";
import { defineTableSort, parseTableSort, rankIn, sortRows } from "@/lib/table-sort";

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
  const { companyId } = await guardTenantPage("accounts:read");
  const sp = await searchParams;
  const sort = parseTableSort(sp, SORT);
  const th = sortHeaders("/credit-notes", sp, SORT, sort);
  const rows = sortRows(await listCreditNotes(companyId), sort, {
    number: (r) => r.number,
    client: (r) => r.clientName,
    invoice: (r) => r.invoiceNumber,
    status: (r) => rankIn(["issued", "void"], r.status),
    issued: (r) => r.issueDate,
    total: (r) => r.grossPence,
  });

  return (
    <div>
      <div className="mb-6">
        <Link href="/invoices" className={buttonClasses("ghost")}>
          ← Invoices
        </Link>
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
                  <TD>{cn.issueDate}</TD>
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
