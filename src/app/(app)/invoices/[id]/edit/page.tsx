import Link from "next/link";
import { notFound } from "next/navigation";
import { guardTenantPage } from "@/lib/auth";
import { getInvoiceDetail } from "@/lib/invoices/queries";
import { listClients } from "@/lib/clients/queries";
import { canEditInvoice, type InvoiceStatus } from "@/lib/invoices/status";
import { InvoiceForm } from "@/components/invoices/invoice-form";
import { buttonClasses } from "@/components/ui/button";
import { penceToPounds } from "@/lib/money";

export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { companyId } = await guardTenantPage("accounts:write");
  const { id } = await params;

  const detail = await getInvoiceDetail(companyId, id);
  if (!detail) notFound();
  if (!canEditInvoice(detail.invoice.status as InvoiceStatus)) {
    notFound();
  }

  const clients = await listClients(companyId);
  const initialLines = detail.lines.map((l) => ({
    key: l.id,
    description: l.description,
    quantity: String(l.quantity),
    unitPricePounds: String(penceToPounds(l.unitPricePence)),
  }));

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href={`/invoices/${id}`} className={buttonClasses("ghost")}>
          ← {detail.invoice.number}
        </Link>
      </div>
      <h1 className="mb-6 font-display text-2xl font-semibold">
        Edit {detail.invoice.number}
      </h1>
      <InvoiceForm
        mode="edit"
        clients={clients}
        invoice={{
          id: detail.invoice.id,
          clientId: detail.invoice.clientId,
          issueDate: detail.invoice.issueDate,
          dueDate: detail.invoice.dueDate,
          notes: detail.invoice.notes,
        }}
        initialLines={initialLines}
      />
    </div>
  );
}
