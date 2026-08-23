import Link from "next/link";
import { guardPage, hasPermission } from "@/lib/auth";
import { listFounders } from "@/lib/expenses/queries";
import { ShareholderForm } from "@/components/shareholders/shareholder-form";
import { buttonClasses } from "@/components/ui/button";
import { isDatabaseConfigured } from "@/env";

export default async function NewShareholderPage() {
  await guardPage("accounts:write");
  const canWrite = await hasPermission("accounts:write");

  if (!isDatabaseConfigured()) {
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold">New shareholder</h1>
        <p className="mt-2 text-muted">Connect a database to add shareholders.</p>
      </div>
    );
  }

  const founders = await listFounders();

  return (
    <div>
      <div className="mb-6">
        <Link href="/dashboard/shareholders" className={buttonClasses("ghost")}>
          ← Shareholders
        </Link>
      </div>
      <h1 className="mb-6 font-display text-2xl font-semibold">New shareholder</h1>
      <ShareholderForm mode="create" users={founders} canWrite={canWrite} />
    </div>
  );
}
