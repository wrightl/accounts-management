import Link from "next/link";
import { guardPage, hasPermission, requireUser } from "@/lib/auth";
import { listExpenses, listFounders, getReimbursableSummary } from "@/lib/expenses/queries";
import {
  EXPENSE_CATEGORIES,
  expenseStatusLabel,
  type ExpenseStatus,
} from "@/lib/expenses/categories";
import { buttonClasses } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/form";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { isDatabaseConfigured } from "@/env";
import { findLocalUserId } from "@/lib/users";
import { ExpenseImportButton } from "@/components/expenses/expense-import-panel";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await guardPage("accounts:read");
  const canWrite = await hasPermission("accounts:write");
  const user = await requireUser();
  const sp = await searchParams;

  if (!isDatabaseConfigured()) {
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold">Expenses</h1>
        <p className="mt-2 text-muted">Connect a database to manage expenses.</p>
      </div>
    );
  }

  const localUserId = await findLocalUserId(user.userId);
  const myReimbursable = sp.mine === "1" && localUserId;

  const [rows, founders, reimbSummary] = await Promise.all([
    listExpenses({
      from: sp.from,
      to: sp.to,
      category: sp.category,
      paidByUserId: myReimbursable ? localUserId : sp.paidBy,
      billable: (sp.billable as "true" | "false" | "") || "",
      status: myReimbursable ? "reimbursable" : sp.status,
    }),
    listFounders(),
    getReimbursableSummary(),
  ]);

  const filterParams = new URLSearchParams();
  if (sp.from) filterParams.set("from", sp.from);
  if (sp.to) filterParams.set("to", sp.to);
  if (sp.category) filterParams.set("category", sp.category);
  if (sp.paidBy) filterParams.set("paidBy", sp.paidBy);
  if (sp.billable) filterParams.set("billable", sp.billable);
  if (sp.status) filterParams.set("status", sp.status);

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Expenses</h1>
          <p className="mt-1 text-muted">Log spend and attach receipts.</p>
        </div>
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            <ExpenseImportButton canWrite={canWrite} />
            <Link href="/dashboard/expenses/new" className={buttonClasses("primary")}>
              New expense
            </Link>
          </div>
        )}
      </div>

      {reimbSummary.count > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-wash/50 px-4 py-3 text-sm">
          <span>
            <span className="font-medium text-foreground">{reimbSummary.count}</span>{" "}
            reimbursable expenses totalling{" "}
            <span className="font-medium text-foreground">{reimbSummary.totalFormatted}</span>
          </span>
          <Link
            href="/dashboard/reimbursements"
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            Create reimbursement run →
          </Link>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={`/dashboard/expenses?${filterParams.toString()}`}
          className={buttonClasses(myReimbursable ? "secondary" : "ghost", "text-sm")}
        >
          All
        </Link>
        {localUserId && (
          <Link
            href={`/dashboard/expenses?mine=1&${filterParams.toString()}`}
            className={buttonClasses(myReimbursable ? "primary" : "secondary", "text-sm")}
          >
            My reimbursable
          </Link>
        )}
      </div>

      <form className="mt-6 grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-2 lg:grid-cols-6">
        <div>
          <Label htmlFor="from">From</Label>
          <Input id="from" name="from" type="date" defaultValue={sp.from ?? ""} />
        </div>
        <div>
          <Label htmlFor="to">To</Label>
          <Input id="to" name="to" type="date" defaultValue={sp.to ?? ""} />
        </div>
        <div>
          <Label htmlFor="category">Category</Label>
          <Select id="category" name="category" defaultValue={sp.category ?? ""}>
            <option value="">All</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="status">Status</Label>
          <Select id="status" name="status" defaultValue={sp.status ?? ""}>
            <option value="">All</option>
            <option value="pending">Pending review</option>
            <option value="recorded">Recorded</option>
            <option value="reimbursable">Reimbursable</option>
            <option value="reimbursed">Reimbursed</option>
            <option value="company_paid">Company paid</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="paidBy">Paid by</Label>
          <Select id="paidBy" name="paidBy" defaultValue={sp.paidBy ?? ""}>
            <option value="">All</option>
            {founders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name || f.email}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="billable">Billable</Label>
          <Select id="billable" name="billable" defaultValue={sp.billable ?? ""}>
            <option value="">All</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </Select>
        </div>
        <div className="sm:col-span-2 lg:col-span-6">
          <button type="submit" className={buttonClasses("secondary")}>
            Filter
          </button>
        </div>
      </form>

      <div className="mt-6">
        {rows.length === 0 ? (
          <p className="text-sm text-muted">No expenses match.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Description</TH>
                <TH>Category</TH>
                <TH>Paid by</TH>
                <TH>Status</TH>
                <TH className="text-right">Amount</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((e) => (
                <TR key={e.id} className={e.status === "pending" ? "bg-amber-50/50 dark:bg-amber-950/20" : undefined}>
                  <TD className="text-muted">{e.spentAt ?? "—"}</TD>
                  <TD>
                    <Link
                      href={`/dashboard/expenses/${e.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {e.description}
                    </Link>
                    {e.status === "pending" ? (
                      <span className="ml-2 text-xs font-medium text-amber-700 dark:text-amber-300">
                        Review
                      </span>
                    ) : null}
                    {e.billable && e.clientName ? (
                      <span className="ml-2 text-xs text-muted">→ {e.clientName}</span>
                    ) : null}
                  </TD>
                  <TD>{e.category ?? "—"}</TD>
                  <TD>{e.paidByName ?? "—"}</TD>
                  <TD>{expenseStatusLabel(e.status as ExpenseStatus)}</TD>
                  <TD className="text-right font-medium">{e.amountFormatted}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </div>
  );
}
