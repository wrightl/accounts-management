import Link from "next/link";
import { notFound } from "next/navigation";
import { guardTenantPage } from "@/lib/auth";
import { listClients } from "@/lib/clients/queries";
import { getRecurringInvoiceDetail } from "@/lib/invoices/recurring-queries";
import { RecurringInvoiceForm } from "@/components/recurring-invoices/recurring-form";
import { buttonClasses } from "@/components/ui/button";
import { penceToPounds } from "@/lib/money";

export default async function EditRecurringInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { companyId } = await guardTenantPage("accounts:write");
  const { id } = await params;

  const detail = await getRecurringInvoiceDetail(companyId, id);
  if (!detail) notFound();

  const clients = await listClients(companyId);
  const { template } = detail;

  return (
    <div>
      <div className="mb-6">
        <Link
          href={`/recurring-invoices/${id}`}
          className={buttonClasses("ghost")}
        >
          ← {template.name}
        </Link>
      </div>
      <h1 className="mb-6 font-display text-2xl font-semibold">Edit schedule</h1>
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
          unitPricePounds: String(penceToPounds(l.unitPricePence)),
        }))}
      />
    </div>
  );
}
