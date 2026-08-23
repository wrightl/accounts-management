import Link from "next/link";
import { guardPage, hasPermission } from "@/lib/auth";
import { listClients } from "@/lib/clients/queries";
import { listFounders } from "@/lib/expenses/queries";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { buttonClasses } from "@/components/ui/button";
import { isDatabaseConfigured } from "@/env";

export default async function NewExpensePage() {
  await guardPage("accounts:write");
  const canWrite = await hasPermission("accounts:write");

  if (!isDatabaseConfigured()) {
    return <p className="text-muted">Connect a database to create expenses.</p>;
  }

  const [founders, clients] = await Promise.all([listFounders(), listClients()]);

  return (
    <div>
      <div className="mb-6">
        <Link href="/dashboard/expenses" className={buttonClasses("ghost")}>
          ← Expenses
        </Link>
      </div>
      <h1 className="mb-6 font-display text-2xl font-semibold">New expense</h1>
      <ExpenseForm
        mode="create"
        founders={founders}
        clients={clients}
        canWrite={canWrite}
      />
    </div>
  );
}
