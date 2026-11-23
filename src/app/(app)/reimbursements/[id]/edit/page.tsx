import { notFound } from "next/navigation";
import { guardTenantPage } from "@/lib/auth";
import { getReimbursementEditData } from "@/lib/reimbursements/queries";
import { canEditReimbursement } from "@/lib/reimbursements/status";
import { EditReimbursementForm } from "@/components/reimbursements/edit-form";
import { PageHeader } from "@/components/ui/page-header";

export default async function EditReimbursementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { companyId } = await guardTenantPage("accounts:write");
  const { id } = await params;

  const data = await getReimbursementEditData(companyId, id);
  if (!data) notFound();
  if (!canEditReimbursement(data.detail.reimbursement.status)) notFound();

  return (
    <div>
      <PageHeader
        backHref={`/reimbursements/${id}`}
        backLabel={data.payeeLabel}
        title="Edit reimbursement run"
        className="mb-6"
      />
      <EditReimbursementForm
        id={id}
        payeeLabel={data.payeeLabel}
        expenses={data.expenses}
        initialExpenseIds={data.initialExpenseIds}
        initialReference={data.initialReference}
        initialReimbursementDate={data.initialReimbursementDate}
      />
    </div>
  );
}
