import Link from "next/link";
import { guardTenantPage } from "@/lib/auth";
import { listClients } from "@/lib/clients/queries";
import { QuoteForm } from "@/components/quotes/quote-form";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { defaultLineVatRate } from "@/lib/vat";
import { onlinePaymentsStatus } from "@/lib/payments/online-status";
import { PAGE_WIDTH } from "@/components/ui/page-width";
import { PageHeader } from "@/components/ui/page-header";

export default async function NewQuotePage() {
  const { companyId } = await guardTenantPage("accounts:write");

  const [clients, company] = await Promise.all([
    listClients(companyId),
    getOrCreateCompanySettings(companyId),
  ]);

  return (
    <div>
      <PageHeader
        backHref="/quotes"
        backLabel="Quotes"
        title="Create quote"
        className="mb-6"
      />
      {clients.length === 0 ? (
        <p className="text-sm text-muted">
          Add a{" "}
          <Link href="/clients/new" className="text-foreground underline">
            client
          </Link>{" "}
          before creating a quote.
        </p>
      ) : (
        <div className={PAGE_WIDTH.editor}>
          <QuoteForm
            mode="create"
            clients={clients}
            vatRegistered={company.vatRegistered}
            defaultVatRate={defaultLineVatRate(company)}
            cardPayments={onlinePaymentsStatus(company) === "enabled"}
          />
        </div>
      )}
    </div>
  );
}
