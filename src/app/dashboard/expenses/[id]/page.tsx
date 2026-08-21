import Link from "next/link";
import { notFound } from "next/navigation";
import { guardPage, hasPermission } from "@/lib/auth";
import { listClients } from "@/lib/invoices/queries";
import { getExpenseDetail, listFounders } from "@/lib/expenses/queries";
import { expenseStatusLabel, type ExpenseStatus } from "@/lib/expenses/categories";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { ReceiptPanel } from "@/components/expenses/receipt-panel";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardTitle, CardValue } from "@/components/ui/card";
import { isDatabaseConfigured } from "@/env";

export default async function ExpenseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await guardPage("accounts:read");
  const canWrite = await hasPermission("accounts:write");
  const { id } = await params;

  if (!isDatabaseConfigured()) notFound();

  const detail = await getExpenseDetail(id);
  if (!detail) notFound();

  const [founders, clients] = await Promise.all([listFounders(), listClients()]);

  return (
    <div>
      <div className="mb-6">
        <Link href="/dashboard/expenses" className={buttonClasses("ghost")}>
          ← Expenses
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">
            {detail.expense.description}
          </h1>
          <p className="mt-1 text-muted">
            {expenseStatusLabel(detail.expense.status as ExpenseStatus)}
            {detail.expense.spentAt ? ` · ${detail.expense.spentAt}` : null}
            {detail.paidBy ? ` · Paid by ${detail.paidBy.name || detail.paidBy.email}` : null}
          </p>
        </div>
        <Card className="min-w-[140px]">
          <CardTitle>Amount</CardTitle>
          <CardValue>{detail.expense.amountFormatted}</CardValue>
        </Card>
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-2">
        <ExpenseForm
          mode="edit"
          expense={detail.expense}
          founders={founders}
          clients={clients}
          canWrite={canWrite}
        />
        <ReceiptPanel
          expenseId={detail.expense.id}
          receipts={detail.receipts}
          canWrite={canWrite}
        />
      </div>
    </div>
  );
}
