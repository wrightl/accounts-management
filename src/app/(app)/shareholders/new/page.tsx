import Link from "next/link";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import { listFounders } from "@/lib/expenses/queries";
import { ShareholderForm } from "@/components/shareholders/shareholder-form";
import { buttonClasses } from "@/components/ui/button";

export default async function NewShareholderPage() {
  const { companyId } = await guardTenantPage("accounts:write");
  const canWrite = await hasPermission("accounts:write");

  const founders = await listFounders(companyId);

  return (
    <div>
      <div className="mb-6">
        <Link href="/shareholders" className={buttonClasses("ghost")}>
          ← Shareholders
        </Link>
      </div>
      <h1 className="mb-6 font-display text-2xl font-semibold">New shareholder</h1>
      <ShareholderForm mode="create" users={founders} canWrite={canWrite} />
    </div>
  );
}
