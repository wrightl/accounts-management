import Link from "next/link";
import { notFound } from "next/navigation";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import { getCreditNoteDetail } from "@/lib/credit-notes/queries";
import { canVoidCreditNote } from "@/lib/credit-notes/status";
import { getInvoiceDetail } from "@/lib/invoices/queries";
import { todayIsoDate } from "@/lib/dates";
import { CreditNoteActions } from "@/components/credit-notes/credit-note-actions";
import { CreditNoteStatusBadge } from "@/components/credit-notes/credit-note-status-badge";
import { Card, CardTitle, CardValue } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { buttonClasses } from "@/components/ui/button";
import {
  formatDiscountPercent,
  formatGBP,
  formatQuantity,
  hasLineDiscount,
  lineNetPence,
} from "@/lib/money";
import { clientDisplayName } from "@/lib/clients/display";

export default async function CreditNoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { companyId } = await guardTenantPage("accounts:read");
  const canWrite = await hasPermission("accounts:write");
  const { id } = await params;

  const detail = await getCreditNoteDetail(companyId, id);
  if (!detail) notFound();
  const { creditNote, invoice, client, lines } = detail;

  const invoiceDetail = await getInvoiceDetail(companyId, invoice.id);
  const refundablePence =
    creditNote.status === "issued" && creditNote.refundedPence === 0
      ? Math.min(invoiceDetail?.refundDuePence ?? 0, creditNote.grossPence)
      : 0;

  return (
    <div>
      <div className="mb-6">
        <Link href="/credit-notes" className={buttonClasses("ghost")}>
          ← Credit notes
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-semibold">{creditNote.number}</h1>
            <CreditNoteStatusBadge status={creditNote.status} />
          </div>
          <p className="mt-1 text-muted">
            <Link href={`/clients/${client.id}`} className="text-foreground hover:underline">
              {clientDisplayName(client)}
            </Link>
            {` · Issued ${creditNote.issueDate} · Credits `}
            <Link href={`/invoices/${invoice.id}`} className="text-foreground hover:underline">
              {invoice.number}
            </Link>
            {creditNote.sentAt
              ? ` · Sent ${creditNote.sentAt.toISOString().slice(0, 10)}`
              : null}
          </p>
          <div className="mt-3">
            <CreditNoteActions
              creditNoteId={creditNote.id}
              canWrite={canWrite}
              canSend={creditNote.status === "issued"}
              sent={creditNote.sentAt != null}
              canVoid={canVoidCreditNote(creditNote)}
              refundablePence={refundablePence}
              today={todayIsoDate()}
            />
          </div>
        </div>
        <Card className="min-w-[160px]">
          <CardTitle>Total credited</CardTitle>
          <CardValue>{creditNote.grossFormatted}</CardValue>
        </Card>
      </div>

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
        <div className="mt-3 space-y-1 text-right text-sm text-muted">
          {creditNote.vatPence > 0 ? (
            <>
              <p>Net {creditNote.netFormatted}</p>
              <p>VAT {creditNote.vatFormatted}</p>
            </>
          ) : null}
        </div>
      </div>

      {creditNote.refundedPence > 0 ? (
        <div className="mt-8">
          <h2 className="mb-2 font-display text-lg font-semibold">Refund</h2>
          <p className="text-sm text-muted">
            {creditNote.refundedFormatted} refunded on {creditNote.refundedAt}
            {creditNote.refundReference ? ` · Ref ${creditNote.refundReference}` : null}
          </p>
        </div>
      ) : refundablePence > 0 ? (
        <p className="mt-8 text-sm text-muted">
          {formatGBP(refundablePence)} is owed back to the client because{" "}
          {invoice.number} had already been paid. Record the refund once you&apos;ve
          paid it.
        </p>
      ) : null}
    </div>
  );
}
