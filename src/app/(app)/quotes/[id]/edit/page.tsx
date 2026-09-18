import Link from "next/link";
import { notFound } from "next/navigation";
import { guardTenantPage } from "@/lib/auth";
import { getQuoteDetail } from "@/lib/quotes/queries";
import { listClients } from "@/lib/clients/queries";
import { canEditQuote } from "@/lib/quotes/status";
import { QuoteForm } from "@/components/quotes/quote-form";
import { buttonClasses } from "@/components/ui/button";
import { penceToPounds } from "@/lib/money";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { defaultLineVatRate } from "@/lib/vat";

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
    unitPricePounds: String(penceToPounds(l.unitPricePence)),
    vatRate: l.vatRate,
  }));

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href={`/quotes/${id}`} className={buttonClasses("ghost")}>
          ← {detail.quote.reference}
        </Link>
      </div>
      <h1 className="mb-6 font-display text-2xl font-semibold">
        Edit {detail.quote.reference}
      </h1>
      <div className="max-w-2xl">
        <QuoteForm
          mode="edit"
          clients={clients}
          quote={{
            id: detail.quote.id,
            clientId: detail.quote.clientId,
            issueDate: detail.quote.issueDate,
            validUntil: detail.quote.validUntil,
            notes: detail.quote.notes,
          }}
          initialLines={initialLines}
          initialMilestones={detail.milestones}
          vatRegistered={company.vatRegistered}
          defaultVatRate={defaultLineVatRate(company)}
        />
      </div>
    </div>
  );
}
