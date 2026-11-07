import { guardTenantPage } from "@/lib/auth";
import { listClients } from "@/lib/clients/queries";
import { OrderForm } from "@/components/orders/order-form";
import { BackLink } from "@/components/ui/back-link";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { defaultLineVatRate } from "@/lib/vat";

export default async function NewOrderPage() {
  const { companyId } = await guardTenantPage("accounts:write");

  const [clients, company] = await Promise.all([
    listClients(companyId),
    getOrCreateCompanySettings(companyId),
  ]);

  return (
    <div>
      <div className="mb-6">
        <BackLink href="/orders">Orders</BackLink>
      </div>
      <h1 className="mb-6 font-display text-2xl font-semibold">New order</h1>
      <div className="max-w-2xl">
        <OrderForm
          clients={clients}
          vatRegistered={company.vatRegistered}
          defaultVatRate={defaultLineVatRate(company)}
        />
      </div>
    </div>
  );
}
