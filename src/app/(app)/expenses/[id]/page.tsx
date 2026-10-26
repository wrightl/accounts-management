import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import { listClients } from "@/lib/clients/queries";
import { getExpenseDetail, listFounders } from "@/lib/expenses/queries";
import { expenseStatusLabel, type ExpenseStatus } from "@/lib/expenses/categories";
import { getReimbursementForExpense } from "@/lib/reimbursements/queries";
import { listBankSettlements } from "@/lib/bank/settlements";
import { BankSettlements } from "@/components/bank/bank-settlements";
import {
  LinkBankTransactionButton,
  UnlinkExpenseButton,
} from "@/components/bank/expense-link-dialog";
import { isExpenseLinkable } from "@/lib/bank/expense-link";
import { periodLockError } from "@/lib/period-lock";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { ReceiptPanel } from "@/components/expenses/receipt-panel";
import { buttonClasses } from "@/components/ui/button";
import { EXPENSE_LIST_COOKIE, expenseListReturnHref } from "@/lib/expenses/list-params";
import {
  ExpenseAmountCard,
  ExpenseSummaryProvider,
  ExpenseTitle,
} from "@/components/expenses/expense-summary";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { expenseOriginalAmount } from "@/lib/expenses/currency";
import { getExpenseRebill, listOrderOptions } from "@/lib/profitability/queries";
import { getPaymentSourceSuggestion } from "@/lib/expenses/payment-source-queries";
import { paymentSourceSummary } from "@/lib/expenses/payment-source";
import { getInboundEmailJob } from "@/lib/expenses/inbound-email";

export default async function ExpenseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ receiptUploadFailed?: string; bankLinkFailed?: string }>;
}) {
  const { companyId } = await guardTenantPage("accounts:read");
  const canWrite = await hasPermission("accounts:write");
  const { id } = await params;
  const { receiptUploadFailed, bankLinkFailed } = await searchParams;

  const detail = await getExpenseDetail(companyId, id);
  if (!detail) notFound();

  const [founders, clients, orders, rebill, linkedRun, settings, settlements] = await Promise.all([
    listFounders(companyId),
    listClients(companyId),
    listOrderOptions(companyId),
    getExpenseRebill(companyId, id),
    getReimbursementForExpense(companyId, id),
    getOrCreateCompanySettings(companyId),
    listBankSettlements(companyId, { expenseId: id }),
  ]);

  const isPending = detail.expense.status === "pending";
  const [paymentSuggestion, inboundJob] = isPending
    ? await Promise.all([
        getPaymentSourceSuggestion(companyId, id),
        detail.expense.inboundEmailJobId
          ? getInboundEmailJob(companyId, detail.expense.inboundEmailJobId)
          : null,
      ])
    : [null, null];
  const paymentSource = paymentSuggestion ? paymentSourceSummary(paymentSuggestion) : null;
  const askedHowPaid =
    Boolean(inboundJob?.paymentQuestionSentAt) && !detail.expense.statedPaymentSource;

  const payeeId = detail.expense.paidByUserId;
  const booksLocked = settlements.some((s) =>
    Boolean(periodLockError(settings.booksLockedThrough, s.bookedAt)),
  );
  const canLinkBank =
    canWrite && settlements.length === 0 && isExpenseLinkable(detail.expense);
  const originalAmount = expenseOriginalAmount(detail.expense);

  const listHref = expenseListReturnHref((await cookies()).get(EXPENSE_LIST_COOKIE)?.value);

  return (
    <div>
      <div className="mb-6">
        <Link href={listHref} className={buttonClasses("ghost")}>
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

      {paymentSource && (paymentSource.notes.length > 0 || askedHowPaid) ? (
        <div
          className={
            paymentSource.conflict
              ? "mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
              : "mb-6 rounded-lg border border-border bg-wash/50 px-4 py-3 text-sm"
          }
        >
          <p className="font-medium">
            {paymentSource.conflict
              ? "The clues about how this was paid disagree. Check before approving."
              : paymentSource.suggestion === "personal"
                ? "Looks like the sender paid personally, so it is set to approve as Reimbursable."
                : paymentSource.suggestion === "company"
                  ? "Looks like the company paid, so it is set to approve as Company paid."
                  : "We don't know yet how this was paid."}
          </p>
          {paymentSource.notes.length > 0 ? (
            <ul className="mt-1 list-disc pl-5">
              {paymentSource.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
          {askedHowPaid ? (
            <p className="mt-1 text-muted">
              We emailed the sender to ask how they paid. Their answer will show here.
            </p>
          ) : null}
        </div>
      ) : null}

      {originalAmount && detail.expense.status === "pending" ? (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          The receipt is in {originalAmount.currency}. The GBP amount is converted at
          the Bank of England rate; change it to what your bank charged if you know
          it. If the receipt is actually in sterling, set the currency to GBP.
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
            href={`/reimbursements?payee=${payeeId}`}
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
            href={`/reimbursements/${linkedRun.reimbursementId}`}
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            View run ({linkedRun.totalFormatted}) →
          </Link>
        </div>
      )}

      {bankLinkFailed && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          Expense saved, but it couldn&apos;t be linked to the bank transaction: {bankLinkFailed}
        </div>
      )}

      <BankSettlements
        settlements={settlements}
        action={
          canWrite && !booksLocked ? <UnlinkExpenseButton expenseId={detail.expense.id} /> : null
        }
      />

      {canLinkBank && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-wash/50 px-4 py-3 text-sm">
          <span className="text-muted">Not linked to a bank transaction yet.</span>
          <LinkBankTransactionButton expenseId={detail.expense.id} />
        </div>
      )}

      <ExpenseSummaryProvider
        initialDescription={detail.expense.description}
        initialPence={detail.expense.amountPence}
        initialOriginal={originalAmount}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <ExpenseTitle fallback={detail.expense.description} />
            <p className="mt-1 text-muted">
              {expenseStatusLabel(detail.expense.status as ExpenseStatus)}
              {detail.expense.spentAt ? ` · ${detail.expense.spentAt}` : null}
              {detail.paidBy ? ` · Paid by ${detail.paidBy.name || detail.paidBy.email}` : null}
            </p>
          </div>
          <ExpenseAmountCard />
        </div>

        <div className="mt-8 grid gap-10 lg:grid-cols-2">
          <ExpenseForm
            listHref={listHref}
            // Remount when the status changes (e.g. a pending email expense is
            // approved, or the sender answers how they paid) so the form's status
            // state re-derives from the saved row.
            key={`${detail.expense.id}:${detail.expense.status}:${paymentSource?.suggestedStatus ?? ""}`}
            mode="edit"
            expense={detail.expense}
            founders={founders}
            clients={clients}
            orders={orders}
            rebilledOn={rebill}
            linkedToBank={settlements.length > 0}
            receiptCount={detail.receipts.length}
            suggestedApproveStatus={paymentSource?.suggestedStatus ?? null}
            canWrite={canWrite}
            defaultMileageRatePence={settings.defaultMileageRatePence}
            vatRegistered={settings.vatRegistered}
            defaultVatRate={settings.vatRegistered ? settings.defaultVatRate : 0}
          />
          <ReceiptPanel
            expenseId={detail.expense.id}
            receipts={detail.receipts}
            canWrite={canWrite}
          />
        </div>
      </ExpenseSummaryProvider>
    </div>
  );
}
