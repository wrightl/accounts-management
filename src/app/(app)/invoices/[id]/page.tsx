import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import { getInvoiceDetail } from "@/lib/invoices/queries";
import { getRecurringTemplateForInvoice } from "@/lib/invoices/recurring-queries";
import {
  canEditInvoice,
  storedStatus,
  type InvoiceStatus,
} from "@/lib/invoices/status";
import { listBankSettlements } from "@/lib/bank/settlements";
import { BankSettlements } from "@/components/bank/bank-settlements";
import { Card, CardTitle, CardValue } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { buttonClasses } from "@/components/ui/button";
import { InvoiceActions } from "@/components/invoices/invoice-actions";
import { InvoiceDueDate } from "@/components/invoices/invoice-due-date";
import { InvoiceStatusSelect } from "@/components/invoices/invoice-status-select";
import { CreditNoteStatusBadge } from "@/components/credit-notes/credit-note-status-badge";
import { CopyButton } from "@/components/ui/copy-button";
import { onlinePaymentsStatus, publicInvoiceUrl } from "@/lib/payments/online-status";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import {
  formatDiscountPercent,
  formatGBP,
  formatQuantity,
  hasLineDiscount,
  lineNetPence,
} from "@/lib/money";
import { clientDisplayName } from "@/lib/clients/display";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { companyId } = await guardTenantPage("accounts:read");
  const canWrite = await hasPermission("accounts:write");
  const canManageSettings = await hasPermission("settings:manage");
  const { id } = await params;

  const detail = await getInvoiceDetail(companyId, id);
  if (!detail) notFound();

  const {
    invoice,
    client,
    lines,
    payments,
    paidFormatted,
    balanceFormatted,
    creditNotes,
    creditedPence,
    creditedFormatted,
    creditablePence,
    refundDuePence,
    refundDueFormatted,
  } = detail;

  const status = invoice.status as InvoiceStatus;
  const stored = storedStatus(invoice.status);
  const canCredit =
    canWrite && (stored === "sent" || stored === "paid") && creditablePence > 0;
  const [recurring, settlements, company] = await Promise.all([
    getRecurringTemplateForInvoice(companyId, invoice.recurringInvoiceId),
    listBankSettlements(companyId, { invoiceId: invoice.id }),
    getOrCreateCompanySettings(companyId),
  ]);
  const clientLink = stored === "draft" ? null : publicInvoiceUrl(invoice.publicToken);
  const takesCardPayments = onlinePaymentsStatus(company) === "enabled";

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
          {clientLink ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">
                Client link{takesCardPayments ? " (view and pay)" : ""}:
              </span>
              <a
                href={clientLink}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 max-w-xs truncate text-foreground hover:underline"
              >
                {clientLink}
              </a>
              <CopyButton value={clientLink} />
              <span className="text-muted">
                {invoice.viewedAt
                  ? `Viewed ${invoice.viewedAt.toISOString().slice(0, 10)}`
                  : "Not viewed yet"}
              </span>
              {canManageSettings && !takesCardPayments && stored === "sent" ? (
                <Link href="/settings/payments" className="text-brand underline underline-offset-2">
                  Take card payments
                </Link>
              ) : null}
            </div>
          ) : null}
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
              {canCredit ? (
                <Link
                  href={`/invoices/${invoice.id}/credit-notes/new`}
                  className={buttonClasses("secondary")}
                >
                  Raise credit note
                </Link>
              ) : null}
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
              {hasLineDiscount(lines) ? (
                <TH className="text-right">Discount</TH>
              ) : null}
              <TH className="text-right">Amount</TH>
            </TR>
          </THead>
          <TBody>
            {lines.map((line) => (
              <TR key={line.id}>
                <TD>{line.description}</TD>
                <TD className="text-right">{formatQuantity(line.quantity)}</TD>
                <TD className="text-right">{formatGBP(line.unitPricePence)}</TD>
                {hasLineDiscount(lines) ? (
                  <TD className="text-right">
                    {formatDiscountPercent(line.discountPercent)}
                  </TD>
                ) : null}
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

      {creditNotes.length > 0 ? (
        <div className="mt-8">
          <h2 className="mb-3 font-display text-lg font-semibold">Credit notes</h2>
          <Table>
            <THead>
              <TR>
                <TH>Number</TH>
                <TH>Issued</TH>
                <TH>Reason</TH>
                <TH>Status</TH>
                <TH className="text-right">Amount</TH>
              </TR>
            </THead>
            <TBody>
              {creditNotes.map((cn) => (
                <TR key={cn.id}>
                  <TD>
                    <Link href={`/credit-notes/${cn.id}`} className="font-medium hover:underline">
                      {cn.number}
                    </Link>
                  </TD>
                  <TD>{cn.issueDate}</TD>
                  <TD className="max-w-xs truncate text-muted">{cn.reason}</TD>
                  <TD>
                    <CreditNoteStatusBadge status={cn.status} />
                  </TD>
                  <TD className="text-right">{cn.grossFormatted}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <p className="mt-3 text-sm text-muted">
            Credited {creditedFormatted}
            {refundDuePence > 0
              ? ` · Refund due to client ${refundDueFormatted}`
              : ` · Balance ${balanceFormatted}`}
          </p>
        </div>
      ) : null}

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
              Paid {paidFormatted}
              {creditedPence > 0 ? ` · Credited ${creditedFormatted}` : null}
              {refundDuePence > 0
                ? ` · Refund due to client ${refundDueFormatted}`
                : ` · Balance ${balanceFormatted}`}
            </p>
            <BankSettlements settlements={settlements} className="mt-4" />
          </>
        )}
      </div>
    </div>
  );
}
