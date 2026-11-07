import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import { recordScopeFor } from "@/lib/accountant/record-scope";
import { RecordQueries } from "@/components/queries/record-queries";
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
import { PageHeader } from "@/components/ui/page-header";
import { InvoiceChaseToggle } from "@/components/invoices/imported-invoice-chase";
import { InvoiceActions } from "@/components/invoices/invoice-actions";
import { InvoiceOriginalDocument } from "@/components/invoices/invoice-original-document";
import { InvoiceDueDate } from "@/components/invoices/invoice-due-date";
import { InvoiceStatusSelect } from "@/components/invoices/invoice-status-select";
import { CreditNoteStatusBadge } from "@/components/credit-notes/credit-note-status-badge";
import { CopyButton } from "@/components/ui/copy-button";
import { publicInvoiceUrl } from "@/lib/payments/online-status";
import {
  formatDiscountPercent,
  formatGBP,
  formatQuantity,
  hasLineDiscount,
  lineNetPence,
} from "@/lib/money";
import { clientDisplayName } from "@/lib/clients/display";
import { RaiseLatePaymentButton } from "@/components/invoices/raise-late-payment-button";
import { getLatePaymentClaims } from "@/lib/invoices/late-payment-queries";
import { latePaymentCharge } from "@/lib/late-payment";
import { todayIsoDate } from "@/lib/dates";
import { DisplayDate } from "@/components/date-format-provider";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { companyId, role } = await guardTenantPage("records:read");
  const scope = recordScopeFor(role);
  const canWrite = await hasPermission("accounts:write");
  const { id } = await params;

  const detail = await getInvoiceDetail(companyId, id, scope);
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
  const [recurring, settlements, latePayment] = await Promise.all([
    getRecurringTemplateForInvoice(companyId, invoice.recurringInvoiceId),
    listBankSettlements(companyId, { invoiceId: invoice.id }),
    getLatePaymentClaims(companyId, invoice.id, invoice.latePaymentForInvoiceId),
  ]);
  const lateCharge =
    scope === "all" && stored === "sent" && invoice.dueDate && !invoice.latePaymentForInvoiceId
      ? latePaymentCharge({
          amountDuePence: detail.balancePence,
          dueDate: invoice.dueDate,
          asOf: todayIsoDate(),
        })
      : null;
  // The link carries the client's payment token, which the pack doesn't include.
  const clientLink =
    stored === "draft" || scope === "pack" ? null : publicInvoiceUrl(invoice.publicToken);

  const isImported = canWrite && invoice.source === "import";
  const copyLink = clientLink ? (
    <CopyButton value={clientLink} label="Copy Client Link" className="text-sm" />
  ) : null;

  return (
    <div>
      <PageHeader
        backHref="/invoices"
        backLabel="Invoices"
        actions={
          <InvoiceStatusSelect invoiceId={invoice.id} status={status} canWrite={canWrite} />
        }
        title={
          <span className="flex items-center gap-2">
            {invoice.number}
            {canWrite && canEditInvoice(status) ? (
              <Link
                href={`/invoices/${invoice.id}/edit`}
                className={buttonClasses("ghost", "size-9 shrink-0 px-0")}
                aria-label="Edit invoice"
              >
                <Pencil className="h-4 w-4" />
              </Link>
            ) : null}
          </span>
        }
        description={
          <>
            {scope === "all" ? (
              <Link href={`/clients/${client.id}`} className="text-foreground hover:underline">
                {clientDisplayName(client)}
              </Link>
            ) : (
              <span className="text-foreground">{clientDisplayName(client)}</span>
            )}
            {invoice.issueDate ? <> · Issued <DisplayDate value={invoice.issueDate} /></> : null}
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
            {clientLink ? (
              invoice.viewedAt ? (
                <> · Viewed <DisplayDate value={invoice.viewedAt} /></>
              ) : (
                " · Not viewed yet"
              )
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
            {latePayment.claimFor ? (
              <>
                {" · Late payment charges on "}
                <Link
                  href={`/invoices/${latePayment.claimFor.id}`}
                  className="text-foreground hover:underline"
                >
                  {latePayment.claimFor.number}
                </Link>
              </>
            ) : null}
          </>
        }
      />

      <div className="mt-4 flex flex-wrap items-start gap-2">
        {canWrite ? (
          <InvoiceActions
            invoiceId={invoice.id}
            invoiceNumber={invoice.number}
            status={invoice.status}
            canWrite={canWrite}
            balanceFormatted={balanceFormatted}
            clientName={client.name}
            companyName={client.companyName}
            isImported={invoice.source === "import"}
            extraActions={
              <>
                {copyLink}
                {canCredit ? (
                  <Link
                    href={`/invoices/${invoice.id}/credit-notes/new`}
                    className={buttonClasses("secondary")}
                  >
                    Raise credit note
                  </Link>
                ) : null}
              </>
            }
          />
        ) : (
          <>
            <a href={`/api/invoices/${invoice.id}/pdf`} className={buttonClasses("secondary")}>
              Download PDF
            </a>
            {copyLink}
          </>
        )}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardTitle>Total</CardTitle>
          <CardValue>{invoice.grossFormatted}</CardValue>
        </Card>
        <Card>
          <CardTitle>Paid</CardTitle>
          <CardValue>{paidFormatted}</CardValue>
        </Card>
        {creditedPence > 0 ? (
          <Card>
            <CardTitle>Credited</CardTitle>
            <CardValue>{creditedFormatted}</CardValue>
          </Card>
        ) : null}
        <Card>
          <CardTitle>{refundDuePence > 0 ? "Refund due" : "Balance due"}</CardTitle>
          <CardValue>{refundDuePence > 0 ? refundDueFormatted : balanceFormatted}</CardValue>
        </Card>
      </div>

      <section className="mt-8">
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
        <dl className="ml-auto mt-3 grid max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
          <dt className="text-muted">Net</dt>
          <dd className="text-right tabular-nums">{invoice.netFormatted}</dd>
          <dt className="text-muted">VAT</dt>
          <dd className="text-right tabular-nums">{invoice.vatFormatted}</dd>
          <dt className="font-medium">Total</dt>
          <dd className="text-right font-medium tabular-nums">{invoice.grossFormatted}</dd>
        </dl>
      </section>

      {invoice.notes ? (
        <section className="mt-8">
          <h2 className="mb-3 font-display text-lg font-semibold">Notes</h2>
          <p className="whitespace-pre-wrap text-sm text-muted">{invoice.notes}</p>
        </section>
      ) : null}

      <section className="mt-8">
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
                    <TD><DisplayDate value={p.receivedAt} /></TD>
                    <TD>{p.method ?? "—"}</TD>
                    <TD className="text-muted">{p.reference ?? "—"}</TD>
                    <TD className="text-right">{p.amountFormatted}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <BankSettlements settlements={settlements} className="mt-4" />
          </>
        )}
      </section>

      {creditNotes.length > 0 ? (
        <section className="mt-8">
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
                  <TD><DisplayDate value={cn.issueDate} /></TD>
                  <TD className="max-w-xs truncate text-muted">{cn.reason}</TD>
                  <TD>
                    <CreditNoteStatusBadge status={cn.status} />
                  </TD>
                  <TD className="text-right">{cn.grossFormatted}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </section>
      ) : null}

      {lateCharge ? (
        <section className="mt-8 rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-display text-lg font-semibold">Late payment charges</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            If {clientDisplayName(client)} is a business, you can claim statutory interest and
            fixed compensation under the Late Payment of Commercial Debts (Interest) Act 1998.
          </p>
          <dl className="mt-3 grid max-w-md grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
            <dt className="text-muted">
              Interest at {lateCharge.ratePercent}% for {lateCharge.daysLate} days
            </dt>
            <dd className="text-right tabular-nums">{formatGBP(lateCharge.interestPence)}</dd>
            <dt className="text-muted">Fixed compensation</dt>
            <dd className="text-right tabular-nums">{formatGBP(lateCharge.compensationPence)}</dd>
            <dt className="font-medium">Claimable today</dt>
            <dd className="text-right font-medium tabular-nums">
              {formatGBP(lateCharge.totalPence)}
            </dd>
          </dl>
          <p className="mt-2 text-xs text-muted">
            {lateCharge.ratePercent}% is the Bank of England base rate of {lateCharge.basePercent}%
            {lateCharge.rateKnown ? "" : " (latest known)"} plus 8%. Interest adds{" "}
            {formatGBP(lateCharge.dailyInterestPence)} a day from <DisplayDate value={invoice.dueDate} />.
          </p>
          <div className="mt-4">
            {latePayment.claim ? (
              <p className="text-sm">
                Claimed on{" "}
                <Link href={`/invoices/${latePayment.claim.id}`} className="underline">
                  {latePayment.claim.number}
                </Link>
                .
              </p>
            ) : canWrite ? (
              <RaiseLatePaymentButton invoiceId={invoice.id} />
            ) : null}
          </div>
        </section>
      ) : null}

      {isImported ? (
        <section className="mt-8">
          <h2 className="mb-3 font-display text-lg font-semibold">Imported invoice</h2>
          {invoice.importBatchId ? (
            <p className="text-sm text-muted">
              Imported from {invoice.importFilename ?? "a PDF upload"} ·{" "}
              <Link
                href={`/invoices/import/${invoice.importBatchId}`}
                className="text-foreground underline underline-offset-2"
              >
                View import
              </Link>
            </p>
          ) : null}
          <InvoiceOriginalDocument
            invoiceId={invoice.id}
            filename={invoice.originalDocumentFilename}
          />
          {stored === "sent" ? (
            <InvoiceChaseToggle
              invoiceId={invoice.id}
              enabled={invoice.chaseEnabled}
              hasClientEmail={Boolean(client.email)}
            />
          ) : null}
        </section>
      ) : null}

      <RecordQueries companyId={companyId} role={role} kind="invoice" recordId={invoice.id} />
    </div>
  );
}
