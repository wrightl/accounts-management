import Link from "next/link";
import { guardTenantPage } from "@/lib/auth";
import { listClients } from "@/lib/clients/queries";
import { InvoiceForm } from "@/components/invoices/invoice-form";
import { buttonClasses } from "@/components/ui/button";

export default async function NewInvoicePage() {
  const { companyId } = await guardTenantPage("accounts:write");

  const clients = await listClients(companyId);

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href="/invoices" className={buttonClasses("ghost")}>
          ← Invoices
        </Link>
      </div>
      <h1 className="mb-6 font-display text-2xl font-semibold">New invoice</h1>
      {clients.length === 0 ? (
        <p className="text-sm text-muted">
          Add a{" "}
          <Link href="/clients/new" className="text-foreground underline">
            client
          </Link>{" "}
          before creating an invoice.
        </p>
      ) : (
        <InvoiceForm mode="create" clients={clients} />
      )}
    </div>
  );
}
