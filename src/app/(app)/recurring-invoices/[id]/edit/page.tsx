import { notFound } from "next/navigation";
import { guardTenantPage } from "@/lib/auth";
import { listClients } from "@/lib/clients/queries";
import { getRecurringInvoiceDetail } from "@/lib/invoices/recurring-queries";
import { RecurringInvoiceForm } from "@/components/recurring-invoices/recurring-form";
import { penceToPounds } from "@/lib/money";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { defaultLineVatRate } from "@/lib/vat";
import { PageHeader } from "@/components/ui/page-header";

export default async function EditRecurringInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { companyId } = await guardTenantPage("accounts:write");
  const { id } = await params;

  const detail = await getRecurringInvoiceDetail(companyId, id);
  if (!detail) notFound();

  const [clients, company] = await Promise.all([
    listClients(companyId),
    getOrCreateCompanySettings(companyId),
  ]);
  const { template } = detail;

  return (
    <div>
      <PageHeader
        backHref={`/recurring-invoices/${id}`}
        backLabel={template.name}
        title="Edit schedule"
        className="mb-6"
      />
      <RecurringInvoiceForm
        mode="edit"
        clients={clients}
        template={{
          id: template.id,
          name: template.name,
          clientId: template.clientId,
          notes: template.notes,
          dayOfMonth: template.dayOfMonth,
          onGenerate: template.onGenerate,
          endsOn: template.endsOn,
          maxOccurrences: template.maxOccurrences,
          enabled: template.enabled,
        }}
        initialLines={template.lineTemplate.map((l) => ({
          key: crypto.randomUUID(),
          description: l.description,
          quantity: String(l.quantity),
          discountPercent: l.discountPercent ? String(l.discountPercent) : "",
          unitPricePounds: String(penceToPounds(l.unitPricePence)),
          vatRate: l.vatRate ?? 0,
        }))}
        vatRegistered={company.vatRegistered}
        defaultVatRate={defaultLineVatRate(company)}
      />
    </div>
  );
}
