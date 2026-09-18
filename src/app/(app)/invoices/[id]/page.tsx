import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import { getInvoiceDetail } from "@/lib/invoices/queries";
import { getRecurringTemplateForInvoice } from "@/lib/invoices/recurring-queries";
import { canEditInvoice, type InvoiceStatus } from "@/lib/invoices/status";
import { Card, CardTitle, CardValue } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { buttonClasses } from "@/components/ui/button";
import { InvoiceActions } from "@/components/invoices/invoice-actions";
import { InvoiceDueDate } from "@/components/invoices/invoice-due-date";
import { InvoiceStatusSelect } from "@/components/invoices/invoice-status-select";
import { formatGBP, lineNetPence } from "@/lib/money";
import { clientDisplayName } from "@/lib/clients/display";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { companyId } = await guardTenantPage("accounts:read");
  const canWrite = await hasPermission("accounts:write");
  const { id } = await params;

  const detail = await getInvoiceDetail(companyId, id);
  if (!detail) notFound();

  const { invoice, client, lines, payments, paidFormatted, balanceFormatted } =
    detail;

  const status = invoice.status as InvoiceStatus;
  const recurring = await getRecurringTemplateForInvoice(
    companyId,
    invoice.recurringInvoiceId,
  );

  return (
    <div>
      <div className="mb-6">
        <Link href="/invoices" className={buttonClasses("ghost")}>
          ← Invoices
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-semibold">{invoice.number}</h1>
            {canWrite && canEditInvoice(status) ? (
              <Link
                href={`/invoices/${invoice.id}/edit`}
                className={buttonClasses("ghost", "size-9 shrink-0 px-0")}
                aria-label="Edit invoice"
              >
                <Pencil className="h-4 w-4" />
              </Link>
            ) : null}
          </div>
          <p className="mt-1 text-muted">
            <Link
              href={`/clients/${client.id}`}
              className="text-foreground hover:underline"
            >
              {clientDisplayName(client)}
            </Link>
            {invoice.issueDate ? ` · Issued ${invoice.issueDate}` : null}
            {invoice.dueDate ? (
              <>
                {" · "}
                <InvoiceDueDate
                  dueDate={invoice.dueDate}
                  status={status}
                  prefix="Due "
                  className="inline-flex"
                />
              </>
            ) : null}
            {recurring ? (
              <>
                {" · From recurring: "}
                <Link
                  href={`/recurring-invoices/${recurring.id}`}
                  className="text-foreground hover:underline"
                >
                  {recurring.name}
                </Link>
              </>
            ) : null}
          </p>
          {canWrite ? (
            <div className="mt-3 flex flex-wrap items-start gap-2">
              <InvoiceStatusSelect
                invoiceId={invoice.id}
                status={status}
                canWrite={canWrite}
              />
              <InvoiceActions
                invoiceId={invoice.id}
                invoiceNumber={invoice.number}
                status={invoice.status}
                canWrite={canWrite}
                balanceFormatted={balanceFormatted}
                clientName={client.name}
                companyName={client.companyName}
              />
            </div>
          ) : (
            <div className="mt-3">
              <InvoiceStatusSelect
                invoiceId={invoice.id}
                status={status}
                canWrite={false}
              />
            </div>
          )}
        </div>
        <Card className="min-w-[160px]">
          <CardTitle>Total</CardTitle>
          <CardValue>{invoice.grossFormatted}</CardValue>
        </Card>
      </div>

      <div className="mt-8">
        <h2 className="mb-3 font-display text-lg font-semibold">Line items</h2>
        <Table>
          <THead>
            <TR>
              <TH>Description</TH>
              <TH className="text-right">Qty</TH>
              <TH className="text-right">Unit</TH>
              <TH className="text-right">Amount</TH>
            </TR>
          </THead>
          <TBody>
            {lines.map((line) => (
              <TR key={line.id}>
                <TD>{line.description}</TD>
                <TD className="text-right">{line.quantity}</TD>
                <TD className="text-right">{formatGBP(line.unitPricePence)}</TD>
                <TD className="text-right">{formatGBP(lineNetPence(line))}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>

      {invoice.notes && (
        <div className="mt-6">
          <h2 className="mb-2 font-display text-lg font-semibold">Notes</h2>
          <p className="whitespace-pre-wrap text-sm text-muted">{invoice.notes}</p>
        </div>
      )}

      <div className="mt-8">
        <h2 className="mb-3 font-display text-lg font-semibold">Payments</h2>
        {payments.length === 0 ? (
          <p className="text-sm text-muted">No payments recorded.</p>
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Received</TH>
                  <TH>Method</TH>
                  <TH>Reference</TH>
                  <TH className="text-right">Amount</TH>
                </TR>
              </THead>
              <TBody>
                {payments.map((p) => (
                  <TR key={p.id}>
                    <TD>{p.receivedAt.toISOString().slice(0, 10)}</TD>
                    <TD>{p.method ?? "—"}</TD>
                    <TD className="text-muted">{p.reference ?? "—"}</TD>
                    <TD className="text-right">{p.amountFormatted}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <p className="mt-3 text-sm text-muted">
              Paid {paidFormatted} · Balance {balanceFormatted}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
