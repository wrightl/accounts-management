import Link from "next/link";
import { guardTenantPage } from "@/lib/auth";
import { listClients } from "@/lib/clients/queries";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { defaultLineVatRate } from "@/lib/vat";
import { InvoiceForm } from "@/components/invoices/invoice-form";
import { listRebillableExpenses } from "@/lib/profitability/queries";
import { toRebillOptions } from "@/lib/profitability/rebill";
import { PageHeader } from "@/components/ui/page-header";

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; orderId?: string }>;
}) {
  const { companyId } = await guardTenantPage("accounts:write");
  const { clientId, orderId } = await searchParams;

  const [clients, company, rebillable] = await Promise.all([
    listClients(companyId),
    getOrCreateCompanySettings(companyId),
    listRebillableExpenses(companyId),
  ]);

  return (
    <div>
      <PageHeader
        backHref="/invoices"
        backLabel="Invoices"
        title="Create invoice"
        className="mb-6"
      />
      {clients.length === 0 ? (
        <p className="text-sm text-muted">
          Add a{" "}
          <Link href="/clients/new" className="text-foreground underline">
            client
          </Link>{" "}
          before creating an invoice.
        </p>
      ) : (
        <InvoiceForm
          mode="create"
          clients={clients}
          vatRegistered={company.vatRegistered}
          defaultVatRate={defaultLineVatRate(company)}
          rebillable={toRebillOptions(rebillable)}
          defaultClientId={clients.some((c) => c.id === clientId) ? clientId : undefined}
          initialRebillIds={
            orderId ? rebillable.filter((r) => r.orderId === orderId).map((r) => r.id) : []
          }
        />
      )}
    </div>
  );
}
