import { BankSettlements } from "@/components/bank/bank-settlements";
import { DisplayDate } from "@/components/date-format-provider";
import { ReceiptPanel } from "@/components/expenses/receipt-panel";
import { RecordQueries } from "@/components/queries/record-queries";
import { BackLink } from "@/components/ui/back-link";
import { Card, CardTitle, CardValue } from "@/components/ui/card";
import { listBankSettlements } from "@/lib/bank/settlements";
import { clientDisplayName } from "@/lib/clients/display";
import { expenseStatusLabel, type ExpenseStatus } from "@/lib/expenses/categories";
import type { getExpenseDetail } from "@/lib/expenses/queries";
import { formatGBP } from "@/lib/money";
import type { Role } from "@/lib/roles";

/** An expense for someone who can't edit it, limited to what the accountant pack exports. */
export async function ExpenseReadOnly({
  companyId,
  role,
  detail,
}: {
  companyId: string;
  role: Role;
  detail: NonNullable<Awaited<ReturnType<typeof getExpenseDetail>>>;
}) {
  const { expense, paidBy, client, receipts } = detail;
  const settlements = await listBankSettlements(companyId, { expenseId: expense.id });
  const fields: [string, React.ReactNode][] = [
    ["Date", expense.spentAt ? <DisplayDate key="date" value={expense.spentAt} /> : "—"],
    ["Category", expense.category ?? "—"],
    ["Status", expenseStatusLabel(expense.status as ExpenseStatus)],
    ["VAT", formatGBP(expense.vatPence)],
    ["Source", expense.source],
    ["Paid by", paidBy ? paidBy.name || paidBy.email : "—"],
    ["Billable", expense.billable ? "Yes" : "No"],
    ["Client", client ? clientDisplayName(client) : "—"],
  ];
  if (expense.mileageMiles != null) {
    fields.push(["Miles", String(expense.mileageMiles)]);
    fields.push(["Mileage rate (pence)", String(expense.mileageRatePence ?? "—")]);
  }

  return (
    <div>
      <div className="mb-6">
        <BackLink href="/expenses">Expenses</BackLink>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="font-display text-2xl font-semibold">{expense.description}</h1>
        <Card className="min-w-[140px]">
          <CardTitle>Amount</CardTitle>
          <CardValue>{expense.amountFormatted}</CardValue>
        </Card>
      </div>
      <BankSettlements settlements={settlements} className="mt-6" />
      <div className="mt-8 grid gap-10 lg:grid-cols-2">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 self-start text-sm">
          {fields.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <ReceiptPanel expenseId={expense.id} receipts={receipts} canWrite={false} />
      </div>
      <RecordQueries companyId={companyId} role={role} kind="expense" recordId={expense.id} />
    </div>
  );
}
