import Link from "next/link";
import { notFound } from "next/navigation";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import { listClients } from "@/lib/clients/queries";
import { getExpenseDetail, listFounders } from "@/lib/expenses/queries";
import { expenseStatusLabel, type ExpenseStatus } from "@/lib/expenses/categories";
import { getReimbursementForExpense } from "@/lib/reimbursements/queries";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { ReceiptPanel } from "@/components/expenses/receipt-panel";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardTitle, CardValue } from "@/components/ui/card";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { isDatabaseConfigured } from "@/env";
import { isForeignCurrency } from "@/lib/expenses/receipt-parse";

export default async function ExpenseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ receiptUploadFailed?: string }>;
}) {
  const { companyId } = await guardTenantPage("accounts:read");
  const canWrite = await hasPermission("accounts:write");
  const { id } = await params;
  const { receiptUploadFailed } = await searchParams;

  if (!isDatabaseConfigured()) notFound();

  const detail = await getExpenseDetail(companyId, id);
  if (!detail) notFound();

  const [founders, clients, linkedRun, settings] = await Promise.all([
    listFounders(companyId),
    listClients(companyId),
    getReimbursementForExpense(companyId, id),
    getOrCreateCompanySettings(companyId),
  ]);

  const payeeId = detail.expense.paidByUserId;
  const foreignCurrency = isForeignCurrency(detail.expense.detectedCurrency)
    ? detail.expense.detectedCurrency!.toUpperCase()
    : null;

  return (
    <div>
      <div className="mb-6">
        <Link href="/dashboard/expenses" className={buttonClasses("ghost")}>
          ← Expenses
        </Link>
      </div>

      {detail.expense.status === "pending" && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          Submitted by email — review the details and attachments, then approve or reject.
          {detail.submitter ? (
            <span className="mt-1 block">
              From {detail.submitter.name || detail.submitter.email}
            </span>
          ) : null}
        </div>
      )}

      {foreignCurrency && detail.expense.status === "pending" ? (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          Foreign currency detected on the receipt ({foreignCurrency}). Amounts in
          this app are recorded in GBP — confirm the sterling amount before
          approving.
        </div>
      ) : null}

      {receiptUploadFailed && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          Expense saved, but receipt upload failed: {decodeURIComponent(receiptUploadFailed)}.
          Upload the receipt below.
        </div>
      )}

      {detail.expense.status === "reimbursable" && !linkedRun && payeeId && (
        <div className="mb-6 rounded-lg border border-border bg-wash/50 px-4 py-3 text-sm">
          This expense is owed back to the founder.{" "}
          <Link
            href={`/dashboard/reimbursements?payee=${payeeId}`}
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            Add to a reimbursement run →
          </Link>
        </div>
      )}

      {linkedRun && (
        <div className="mb-6 rounded-lg border border-border bg-wash/50 px-4 py-3 text-sm">
          On reimbursement run for {linkedRun.payeeLabel}
          {linkedRun.status === "paid" && linkedRun.paidAt
            ? ` · paid ${linkedRun.paidAt.toISOString().slice(0, 10)}`
            : ` · ${linkedRun.status}`}
          .{" "}
          <Link
            href={`/dashboard/reimbursements/${linkedRun.reimbursementId}`}
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            View run ({linkedRun.totalFormatted}) →
          </Link>
        </div>
      )}

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
          defaultMileageRatePence={settings.defaultMileageRatePence}
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
