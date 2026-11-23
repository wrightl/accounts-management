import { guardTenantPage } from "@/lib/auth";
import { listClients } from "@/lib/clients/queries";
import { RecurringInvoiceForm } from "@/components/recurring-invoices/recurring-form";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { defaultLineVatRate } from "@/lib/vat";
import { PageHeader } from "@/components/ui/page-header";

export default async function NewRecurringInvoicePage() {
  const { companyId } = await guardTenantPage("accounts:write");

  const [clients, company] = await Promise.all([
    listClients(companyId),
    getOrCreateCompanySettings(companyId),
  ]);

  return (
    <div>
      <PageHeader
        backHref="/recurring-invoices"
        backLabel="Recurring"
        title="Create schedule"
        className="mb-6"
      />
      <RecurringInvoiceForm
        mode="create"
        clients={clients}
        vatRegistered={company.vatRegistered}
        defaultVatRate={defaultLineVatRate(company)}
      />
    </div>
  );
}
