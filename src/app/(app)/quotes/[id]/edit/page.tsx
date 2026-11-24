import { notFound } from "next/navigation";
import { guardTenantPage } from "@/lib/auth";
import { getQuoteDetail } from "@/lib/quotes/queries";
import { listClients } from "@/lib/clients/queries";
import { canEditQuote } from "@/lib/quotes/status";
import { QuoteForm } from "@/components/quotes/quote-form";
import { penceToPounds } from "@/lib/money";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { defaultLineVatRate } from "@/lib/vat";
import { onlinePaymentsStatus } from "@/lib/payments/online-status";
import { PAGE_WIDTH } from "@/components/ui/page-width";
import { PageHeader } from "@/components/ui/page-header";

export default async function EditQuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { companyId } = await guardTenantPage("accounts:write");
  const { id } = await params;

  const detail = await getQuoteDetail(companyId, id);
  if (!detail) notFound();
  if (!canEditQuote(detail.quote.status)) notFound();

  const [clients, company] = await Promise.all([
    listClients(companyId),
    getOrCreateCompanySettings(companyId),
  ]);
  const initialLines = detail.lines.map((l) => ({
    key: l.id,
    description: l.description,
    quantity: String(l.quantity),
    discountPercent: l.discountPercent ? String(l.discountPercent) : "",
    unitPricePounds: String(penceToPounds(l.unitPricePence)),
    vatRate: l.vatRate,
    taxCode: l.taxCode ?? undefined,
  }));

  return (
    <div>
      <PageHeader
        backHref={`/quotes/${id}`}
        backLabel={detail.quote.reference}
        title={<>Edit {detail.quote.reference}</>}
        className="mb-6"
      />
      <div className={PAGE_WIDTH.editor}>
        <QuoteForm
          mode="edit"
          clients={clients}
          quote={{
            id: detail.quote.id,
            clientId: detail.quote.clientId,
            issueDate: detail.quote.issueDate,
            validUntil: detail.quote.validUntil,
            notes: detail.quote.notes,
            depositOnAccept: detail.quote.depositOnAccept,
          }}
          initialLines={initialLines}
          initialMilestones={detail.milestones}
          vatRegistered={company.vatRegistered}
          defaultVatRate={defaultLineVatRate(company)}
          cardPayments={onlinePaymentsStatus(company) === "enabled"}
        />
      </div>
    </div>
  );
}
