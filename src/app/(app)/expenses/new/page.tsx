import Link from "next/link";
import { guardTenantPage, hasPermission, requireUser } from "@/lib/auth";
import { listClients } from "@/lib/clients/queries";
import { listFounders } from "@/lib/expenses/queries";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { buttonClasses } from "@/components/ui/button";
import { isDatabaseConfigured } from "@/env";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { findLocalUserId } from "@/lib/users";

export default async function NewExpensePage() {
  const { companyId } = await guardTenantPage("accounts:write");
  const canWrite = await hasPermission("accounts:write");
  const user = await requireUser();

  if (!isDatabaseConfigured()) {
    return <p className="text-muted">Connect a database to create expenses.</p>;
  }

  const [founders, clients, localUserId, settings] = await Promise.all([
    listFounders(companyId),
    listClients(companyId),
    findLocalUserId(user.userId),
    getOrCreateCompanySettings(companyId),
  ]);

  return (
    <div>
      <div className="mb-6">
        <Link href="/expenses" className={buttonClasses("ghost")}>
          ← Expenses
        </Link>
      </div>
      <h1 className="mb-6 font-display text-2xl font-semibold">New expense</h1>
      <ExpenseForm
        mode="create"
        founders={founders}
        clients={clients}
        canWrite={canWrite}
        defaultPaidByUserId={localUserId}
        defaultMileageRatePence={settings.defaultMileageRatePence}
        receiptOcrProvider={settings.receiptOcrProvider ?? "local"}
        receiptOcrModel={settings.receiptOcrModel}
      />
    </div>
  );
}
