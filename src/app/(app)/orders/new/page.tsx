import { guardTenantPage } from "@/lib/auth";
import { listClients } from "@/lib/clients/queries";
import { OrderForm } from "@/components/orders/order-form";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { defaultLineVatRate } from "@/lib/vat";
import { PAGE_WIDTH } from "@/components/ui/page-width";
import { PageHeader } from "@/components/ui/page-header";

export default async function NewOrderPage() {
  const { companyId } = await guardTenantPage("accounts:write");

  const [clients, company] = await Promise.all([
    listClients(companyId),
    getOrCreateCompanySettings(companyId),
  ]);

  return (
    <div>
      <PageHeader
        backHref="/orders"
        backLabel="Orders"
        title="Create order"
        className="mb-6"
      />
      <div className={PAGE_WIDTH.editor}>
        <OrderForm
          clients={clients}
          vatRegistered={company.vatRegistered}
          defaultVatRate={defaultLineVatRate(company)}
        />
      </div>
    </div>
  );
}
