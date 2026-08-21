import Link from "next/link";
import { guardPage, hasPermission } from "@/lib/auth";
import { listExpenses, listFounders } from "@/lib/expenses/queries";
import { EXPENSE_CATEGORIES, expenseStatusLabel, type ExpenseStatus } from "@/lib/expenses/categories";
import { buttonClasses } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/form";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { isDatabaseConfigured } from "@/env";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await guardPage("accounts:read");
  const canWrite = await hasPermission("accounts:write");
  const sp = await searchParams;

  if (!isDatabaseConfigured()) {
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold">Expenses</h1>
        <p className="mt-2 text-muted">Connect a database to manage expenses.</p>
      </div>
    );
  }

  const [rows, founders] = await Promise.all([
    listExpenses({
      from: sp.from,
      to: sp.to,
      category: sp.category,
      paidByUserId: sp.paidBy,
      billable: (sp.billable as "true" | "false" | "") || "",
      status: sp.status,
    }),
    listFounders(),
  ]);

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Expenses</h1>
          <p className="mt-1 text-muted">Log spend and attach receipts.</p>
        </div>
        {canWrite && (
          <Link href="/dashboard/expenses/new" className={buttonClasses("primary")}>
            New expense
          </Link>
        )}
      </div>

      <form className="mt-6 grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-2 lg:grid-cols-5">
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
        <div className="sm:col-span-2 lg:col-span-5">
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
                <TR key={e.id}>
                  <TD className="text-muted">{e.spentAt ?? "—"}</TD>
                  <TD>
                    <Link
                      href={`/dashboard/expenses/${e.id}`}
                      className="font-medium text-brand hover:underline"
                    >
                      {e.description}
                    </Link>
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
