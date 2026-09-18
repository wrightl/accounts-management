import Link from "next/link";
import { guardTenantPage } from "@/lib/auth";
import { listClients } from "@/lib/clients/queries";
import { RecurringInvoiceForm } from "@/components/recurring-invoices/recurring-form";
import { buttonClasses } from "@/components/ui/button";
import { isDatabaseConfigured } from "@/env";

export default async function NewRecurringInvoicePage() {
  const { companyId } = await guardTenantPage("accounts:write");

  if (!isDatabaseConfigured()) {
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold">New schedule</h1>
        <p className="mt-2 text-muted">Connect a database first.</p>
      </div>
    );
  }

  const clients = await listClients(companyId);

  return (
    <div>
      <div className="mb-6">
        <Link href="/recurring-invoices" className={buttonClasses("ghost")}>
          ← Recurring
        </Link>
      </div>
      <h1 className="mb-6 font-display text-2xl font-semibold">New schedule</h1>
      <RecurringInvoiceForm mode="create" clients={clients} />
    </div>
  );
}
