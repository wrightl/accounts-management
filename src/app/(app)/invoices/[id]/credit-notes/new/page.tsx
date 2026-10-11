import Link from "next/link";
import { notFound } from "next/navigation";
import { guardTenantPage } from "@/lib/auth";
import { getInvoiceDetail } from "@/lib/invoices/queries";
import { storedStatus } from "@/lib/invoices/status";
import { todayIsoDate } from "@/lib/dates";
import { formatGBP, penceToPounds } from "@/lib/money";
import { CreditNoteForm } from "@/components/credit-notes/credit-note-form";
import { buttonClasses } from "@/components/ui/button";

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

  const { invoice, lines, creditablePence, creditedPence } = detail;
  // A full credit is the common case, so start from the invoice's lines when
  // nothing has been credited yet. After a partial credit, start blank.
  const initialLines =
    creditedPence === 0
      ? lines.map((l) => ({
          key: l.id,
          description: l.description,
          quantity: String(l.quantity),
          unitPricePounds: String(penceToPounds(l.unitPricePence)),
          discountPercent: l.discountPercent ? String(l.discountPercent) : "",
          vatRate: l.vatRate,
        }))
      : [];
  const today = todayIsoDate();
  const defaultIssueDate =
    invoice.issueDate && invoice.issueDate > today ? invoice.issueDate : today;

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href={`/invoices/${id}`} className={buttonClasses("ghost")}>
          ← {invoice.number}
        </Link>
      </div>
      <h1 className="font-display text-2xl font-semibold">Credit note for {invoice.number}</h1>
      <p className="mt-1 mb-6 text-muted">
        Invoice total {invoice.grossFormatted}
        {creditedPence > 0 ? ` · ${formatGBP(creditedPence)} already credited` : null}
      </p>
      {creditablePence <= 0 ? (
        <p className="text-sm text-muted">This invoice has been fully credited.</p>
      ) : (
        <CreditNoteForm
          invoiceId={invoice.id}
          invoiceNumber={invoice.number}
          initialLines={initialLines}
          creditablePence={creditablePence}
          vatEnabled={invoice.vatPence > 0}
          defaultIssueDate={defaultIssueDate}
        />
      )}
    </div>
  );
}
