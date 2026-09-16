import Link from "next/link";
import { notFound } from "next/navigation";
import { guardTenantPage } from "@/lib/auth";
import { getReimbursementEditData } from "@/lib/reimbursements/queries";
import { canEditReimbursement } from "@/lib/reimbursements/status";
import { EditReimbursementForm } from "@/components/reimbursements/edit-form";
import { buttonClasses } from "@/components/ui/button";
import { isDatabaseConfigured } from "@/env";

export default async function EditReimbursementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { companyId } = await guardTenantPage("accounts:write");
  const { id } = await params;

  if (!isDatabaseConfigured()) notFound();

  const data = await getReimbursementEditData(companyId, id);
  if (!data) notFound();
  if (!canEditReimbursement(data.detail.reimbursement.status)) notFound();

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href={`/reimbursements/${id}`} className={buttonClasses("ghost")}>
          ← {data.payeeLabel}
        </Link>
      </div>
      <h1 className="mb-6 font-display text-2xl font-semibold">
        Edit reimbursement run
      </h1>
      <EditReimbursementForm
        id={id}
        payeeLabel={data.payeeLabel}
        expenses={data.expenses}
        initialExpenseIds={data.initialExpenseIds}
        initialReference={data.initialReference}
      />
    </div>
  );
}
