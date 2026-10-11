import Link from "next/link";
import { guardTenantPage } from "@/lib/auth";
import { listCreditNotes } from "@/lib/credit-notes/queries";
import { CreditNoteStatusBadge } from "@/components/credit-notes/credit-note-status-badge";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

export default async function CreditNotesPage() {
  const { companyId } = await guardTenantPage("accounts:read");
  const rows = await listCreditNotes(companyId);

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
                <TH>Number</TH>
                <TH>Client</TH>
                <TH>Invoice</TH>
                <TH>Status</TH>
                <TH>Issue date</TH>
                <TH className="text-right">Total</TH>
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
