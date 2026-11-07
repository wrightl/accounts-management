import { guardTenantPage, hasPermission } from "@/lib/auth";
import { listFounders } from "@/lib/expenses/queries";
import { ShareholderForm } from "@/components/shareholders/shareholder-form";
import { BackLink } from "@/components/ui/back-link";

export default async function NewShareholderPage() {
  const { companyId } = await guardTenantPage("accounts:write");
  const canWrite = await hasPermission("accounts:write");

  const founders = await listFounders(companyId);

  return (
    <div>
      <div className="mb-6">
        <BackLink href="/shareholders">Shareholders</BackLink>
      </div>
      <h1 className="mb-6 font-display text-2xl font-semibold">New shareholder</h1>
      <ShareholderForm mode="create" users={founders} canWrite={canWrite} />
    </div>
  );
}
