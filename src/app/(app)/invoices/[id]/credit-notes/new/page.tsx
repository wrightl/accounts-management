import { notFound } from "next/navigation";
import { guardTenantPage } from "@/lib/auth";
import { getInvoiceDetail } from "@/lib/invoices/queries";
import { storedStatus } from "@/lib/invoices/status";
import { todayIsoDate } from "@/lib/dates";
import { formatMoney, penceToPounds } from "@/lib/money";
import { CreditNoteForm } from "@/components/credit-notes/credit-note-form";
import { PageHeader } from "@/components/ui/page-header";

export default async function NewCreditNotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { companyId } = await guardTenantPage("accounts:write");
  const { id } = await params;

  const detail = await getInvoiceDetail(companyId, id);
  if (!detail) notFound();
  const status = storedStatus(detail.invoice.status);
  if (status !== "sent" && status !== "paid") notFound();

  const { invoice, lines, creditableMinor, creditedMinor } = detail;
  // A full credit is the common case, so start from the invoice's lines when
  // nothing has been credited yet. After a partial credit, start blank.
  const initialLines =
    creditedMinor === 0
      ? lines.map((l) => ({
          key: l.id,
          description: l.description,
          quantity: String(l.quantity),
          unitPricePounds: String(penceToPounds(l.unitPricePence)),
          discountPercent: l.discountPercent ? String(l.discountPercent) : "",
          vatRate: l.vatRate,
    taxCode: l.taxCode ?? undefined,
        }))
      : [];
  const today = todayIsoDate();
  const defaultIssueDate =
    invoice.issueDate && invoice.issueDate > today ? invoice.issueDate : today;

  return (
    <div>
      <PageHeader
        backHref={`/invoices/${id}`}
        backLabel={invoice.number}
        title={<>Credit note for {invoice.number}</>}
        description={
          <>
            The invoice total is {invoice.grossFormatted}
            {creditedMinor > 0 ? `, of which ${formatMoney(creditedMinor, invoice.currency)} is already credited` : null}.
          </>
        }
        className="mb-6"
      />
      {creditableMinor <= 0 ? (
        <p className="text-sm text-muted">This invoice has been fully credited.</p>
      ) : (
        <CreditNoteForm
          invoiceId={invoice.id}
          invoiceNumber={invoice.number}
          initialLines={initialLines}
          creditablePence={creditableMinor}
          currency={invoice.currency}
          vatEnabled={invoice.vatPence > 0}
          defaultIssueDate={defaultIssueDate}
        />
      )}
    </div>
  );
}
