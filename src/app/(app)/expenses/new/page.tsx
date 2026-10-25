import Link from "next/link";
import { cookies } from "next/headers";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import { listClients } from "@/lib/clients/queries";
import { listFounders } from "@/lib/expenses/queries";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { buttonClasses } from "@/components/ui/button";
import { EXPENSE_LIST_COOKIE, expenseListReturnHref } from "@/lib/expenses/list-params";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { getReceiptOcrSettings } from "@/lib/platform-settings";
import { listOrderOptions } from "@/lib/profitability/queries";
import { getBankTransactionById } from "@/lib/bank/queries";
import { bankDebitLinkError } from "@/lib/bank/expense-link";
import { formatGBP } from "@/lib/money";

export default async function NewExpensePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { status, clientId, orderId, bankTransactionId } = await searchParams;
  const { companyId } = await guardTenantPage("accounts:write");
  const canWrite = await hasPermission("accounts:write");

  const [founders, clients, orders, settings, ocr] = await Promise.all([
    listFounders(companyId),
    listClients(companyId),
    listOrderOptions(companyId),
    getOrCreateCompanySettings(companyId),
    getReceiptOcrSettings(),
  ]);

  const [bankTx, bankLinkError] = bankTransactionId
    ? await Promise.all([
        getBankTransactionById(companyId, bankTransactionId),
        bankDebitLinkError(companyId, bankTransactionId),
      ])
    : [null, null];
  const payee = bankTx ? (bankTx.counterparty ?? bankTx.description ?? bankTx.reference) : null;
  const fromBankTransaction =
    bankTx && !bankLinkError
      ? {
          id: bankTx.id,
          description: payee ?? "",
          bookedAt: bankTx.bookedAt,
          amountPence: Math.abs(bankTx.amountPence),
          summary: [bankTx.bookedAt, formatGBP(Math.abs(bankTx.amountPence)), payee]
            .filter(Boolean)
            .join(" · "),
        }
      : null;

  const listHref = expenseListReturnHref((await cookies()).get(EXPENSE_LIST_COOKIE)?.value);

  return (
    <div>
      <div className="mb-6">
        <Link href={listHref} className={buttonClasses("ghost")}>
          ← Expenses
        </Link>
      </div>
      <h1 className="mb-6 font-display text-2xl font-semibold">New expense</h1>
      {bankLinkError ? (
        <div className="mx-auto mb-6 max-w-xl rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          This expense won&apos;t be linked to the bank transaction. {bankLinkError}
        </div>
      ) : null}
      <ExpenseForm
        listHref={listHref}
        mode="create"
        founders={founders}
        clients={clients}
        orders={orders}
        defaultOrderId={orders.some((o) => o.id === orderId) ? orderId : null}
        defaultClientId={
          orders.find((o) => o.id === orderId)?.clientId ??
          (clients.some((c) => c.id === clientId) ? clientId : null)
        }
        canWrite={canWrite}
        defaultStatus={status === "reimbursable" ? "reimbursable" : ""}
        defaultMileageRatePence={settings.defaultMileageRatePence}
        receiptOcrProvider={ocr.provider ?? "local"}
        receiptOcrModel={ocr.model}
        vatRegistered={settings.vatRegistered}
        defaultVatRate={settings.vatRegistered ? settings.defaultVatRate : 0}
        fromBankTransaction={fromBankTransaction}
      />
    </div>
  );
}
