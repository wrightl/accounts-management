import { guardTenantPage, hasPermission } from "@/lib/auth";
import { listFounders } from "@/lib/expenses/queries";
import { ShareholderForm } from "@/components/shareholders/shareholder-form";
import { PageHeader } from "@/components/ui/page-header";

export default async function NewShareholderPage() {
  const { companyId } = await guardTenantPage("accounts:write");
  const canWrite = await hasPermission("accounts:write");

  const founders = await listFounders(companyId);

  return (
    <div>
      <PageHeader
        backHref="/shareholders"
        backLabel="Shareholders"
        title="Create shareholder"
        className="mb-6"
      />
      <ShareholderForm mode="create" users={founders} canWrite={canWrite} />
    </div>
  );
}
