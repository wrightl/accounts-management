import { guardTenantPage } from "@/lib/auth";
import { listClients } from "@/lib/clients/queries";
import { RecurringInvoiceForm } from "@/components/recurring-invoices/recurring-form";
import { BackLink } from "@/components/ui/back-link";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { defaultLineVatRate } from "@/lib/vat";

export default async function NewRecurringInvoicePage() {
  const { companyId } = await guardTenantPage("accounts:write");

  const [clients, company] = await Promise.all([
    listClients(companyId),
    getOrCreateCompanySettings(companyId),
  ]);

  return (
    <div>
      <div className="mb-6">
        <BackLink href="/recurring-invoices">Recurring</BackLink>
      </div>
      <h1 className="mb-6 font-display text-2xl font-semibold">New schedule</h1>
      <RecurringInvoiceForm
        mode="create"
        clients={clients}
        vatRegistered={company.vatRegistered}
        defaultVatRate={defaultLineVatRate(company)}
      />
    </div>
  );
}
