import Link from "next/link";
import { notFound } from "next/navigation";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import { recordScopeFor } from "@/lib/accountant/record-scope";
import { RecordQueries } from "@/components/queries/record-queries";
import { getCreditNoteDetail } from "@/lib/credit-notes/queries";
import { canVoidCreditNote } from "@/lib/credit-notes/status";
import { getInvoiceDetail } from "@/lib/invoices/queries";
import { todayIsoDate } from "@/lib/dates";
import { CreditNoteActions } from "@/components/credit-notes/credit-note-actions";
import { CreditNoteStatusBadge } from "@/components/credit-notes/credit-note-status-badge";
import { Card, CardTitle, CardValue } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import {
  formatDiscountPercent,
  formatMoney,
  formatQuantity,
  hasLineDiscount,
  lineNetPence,
} from "@/lib/money";
import { clientDisplayName } from "@/lib/clients/display";
import { describeDocumentRate, isForeignDocumentCurrency } from "@/lib/currency";
import { DisplayDate } from "@/components/date-format-provider";
import { PageHeader } from "@/components/ui/page-header";

export default async function CreditNoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { companyId, role } = await guardTenantPage("records:read");
  const scope = recordScopeFor(role);
  const canWrite = await hasPermission("accounts:write");
  const { id } = await params;

  const detail = await getCreditNoteDetail(companyId, id, scope);
  if (!detail) notFound();
  const { creditNote, invoice, client, lines } = detail;

  const invoiceDetail = await getInvoiceDetail(companyId, invoice.id);
  // In the invoice's currency.
  const refundableMinor =
    creditNote.status === "issued" && creditNote.refundedMinor === 0
      ? Math.min(invoiceDetail?.refundDueMinor ?? 0, creditNote.grossMinor)
      : 0;

  return (
    <div>
      <PageHeader
        backHref="/credit-notes"
        backLabel="Credit notes"
        title={creditNote.number}
        titleAddon={<CreditNoteStatusBadge status={creditNote.status} />}
        description={
          <>
            {scope === "all" ? (
              <Link href={`/clients/${client.id}`} className="text-foreground hover:underline">
                {clientDisplayName(client)}
              </Link>
            ) : (
              <span className="text-foreground">{clientDisplayName(client)}</span>
            )}
            <> · Issued <DisplayDate value={creditNote.issueDate} /> · Credits </>
            <Link href={`/invoices/${invoice.id}`} className="text-foreground hover:underline">
              {invoice.number}
            </Link>
            {creditNote.sentAt
              ? <> · Sent <DisplayDate value={creditNote.sentAt} /></>
              : null}
          </>
        }
      />

      <div className="mt-4 flex flex-wrap items-start gap-2">
        <CreditNoteActions
          creditNoteId={creditNote.id}
          canWrite={canWrite}
          canSend={creditNote.status === "issued"}
          sent={creditNote.sentAt != null}
          canVoid={canVoidCreditNote(creditNote)}
          refundableMinor={refundableMinor}
          currency={creditNote.currency}
          today={todayIsoDate()}
        />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardTitle>Total credited</CardTitle>
          <CardValue>{creditNote.grossFormatted}</CardValue>
        </Card>
      </div>
      {isForeignDocumentCurrency(creditNote.currency) ? (
        <p className="mt-2 text-sm text-muted">
          {creditNote.grossSterlingFormatted} in your books, at the invoice&apos;s rate of{" "}
          {describeDocumentRate(creditNote)}.
        </p>
      ) : null}

      <div className="mt-6">
        <h2 className="mb-2 font-display text-lg font-semibold">Reason</h2>
        <p className="whitespace-pre-wrap text-sm text-muted">{creditNote.reason}</p>
      </div>

      <div className="mt-8">
        <h2 className="mb-3 font-display text-lg font-semibold">Lines</h2>
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
                <TD className="text-right">{formatMoney(line.unitPricePence, creditNote.currency)}</TD>
                {hasLineDiscount(lines) ? (
                  <TD className="text-right">
                    {formatDiscountPercent(line.discountPercent)}
                  </TD>
                ) : null}
                <TD className="text-right">{formatMoney(lineNetPence(line), creditNote.currency)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <div className="mt-3 space-y-1 text-right text-sm text-muted">
          {creditNote.vatMinor > 0 ? (
            <>
              <p>Net {creditNote.netFormatted}</p>
              <p>VAT {creditNote.vatFormatted}</p>
            </>
          ) : null}
        </div>
      </div>

      {creditNote.refundedMinor > 0 ? (
        <div className="mt-8">
          <h2 className="mb-2 font-display text-lg font-semibold">Refund</h2>
          <p className="text-sm text-muted">
            {creditNote.refundedFormatted} refunded on <DisplayDate value={creditNote.refundedAt} />
            {creditNote.refundReference ? ` · Ref ${creditNote.refundReference}` : null}
          </p>
        </div>
      ) : refundableMinor > 0 ? (
        <p className="mt-8 text-sm text-muted">
          {formatMoney(refundableMinor, creditNote.currency)} is owed back to the client because{" "}
          {invoice.number} had already been paid. Record the refund once you&apos;ve
          paid it.
        </p>
      ) : null}

      <RecordQueries companyId={companyId} role={role} kind="credit_note" recordId={creditNote.id} />
    </div>
  );
}
