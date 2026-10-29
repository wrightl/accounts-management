import Link from "next/link";
import { Link2 } from "lucide-react";
import { guardTenantPage, hasPermission, requireUser } from "@/lib/auth";
import {
  getEmailExpensesFingerprint,
  getReimbursableSummary,
  listExpenses,
  listFounders,
} from "@/lib/expenses/queries";
import {
  EXPENSE_CATEGORIES,
  expenseStatusLabel,
  type ExpenseStatus,
} from "@/lib/expenses/categories";
import {
  ensureInboundAlias,
  expenseInboundAddress,
  getInboundAlias,
  inboundMailboxConfig,
} from "@/lib/expenses/inbound-mailbox";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { findLocalUser } from "@/lib/users";
import { getCompany } from "@/lib/tenant";
import { ExpenseImportButton } from "@/components/expenses/expense-import-panel";
import { ExpenseLiveRefresh } from "@/components/expenses/expense-live-refresh";
import { InboundAddress } from "@/components/expenses/inbound-address";
import { sortHeaders } from "@/components/ui/sortable-th";
import { EXPENSE_SORT } from "@/lib/expenses/list-sort";
import {
  expenseListHref,
  expenseListSearchParams,
  hasActiveExpenseFilters,
  parseExpenseListParams,
  resolveExpenseListDateRange,
} from "@/lib/expenses/list-params";
import { ExpenseFilters } from "@/components/expenses/expense-filters";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { getPaymentSourceSuggestions } from "@/lib/expenses/payment-source-queries";
import { paymentSourceListLabel } from "@/lib/expenses/payment-source";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { companyId } = await guardTenantPage("accounts:read");
  const canWrite = await hasPermission("accounts:write");
  const user = await requireUser();
  const parsed = parseExpenseListParams(await searchParams);

  const [localUser, settings] = await Promise.all([
    findLocalUser(user.userId),
    getOrCreateCompanySettings(companyId),
  ]);
  const localUserId = localUser?.id ?? null;
  const params = { ...parsed, mine: parsed.mine && Boolean(localUserId) };
  const myReimbursable = params.mine;
  const dateRange = resolveExpenseListDateRange(params, settings.financialYearEndMonth);
  const filtered = hasActiveExpenseFilters(params);

  const [rows, founders, reimbSummary, company, emailFingerprint] = await Promise.all([
    listExpenses(companyId, {
      q: params.q,
      from: dateRange.from,
      to: dateRange.to,
      category: params.category,
      paidByUserId: myReimbursable ? localUserId! : params.paidBy,
      billable: params.billable,
      status: myReimbursable ? "reimbursable" : params.status,
      sort: { sort: params.sort, dir: params.dir },
    }),
    listFounders(companyId),
    getReimbursableSummary(companyId),
    getCompany(companyId),
    getEmailExpensesFingerprint(companyId),
  ]);

  const paymentSources = await getPaymentSourceSuggestions(
    companyId,
    rows.filter((r) => r.status === "pending").map((r) => r.id),
  );

  const isFounder = localUser?.role === "admin" || localUser?.role === "user";
  // Members from before short addresses, if the backfill hasn't reached them yet.
  const inboundAlias =
    localUser && isFounder
      ? ((await getInboundAlias(localUser.id, companyId)) ??
        (await ensureInboundAlias(localUser.id, companyId)))
      : null;
  const legacyInboundAddress =
    inboundAlias && localUser?.expenseInboundSlug
      ? expenseInboundAddress(company.slug, localUser.expenseInboundSlug)
      : null;

  const sortHeader = sortHeaders(
    "/expenses",
    Object.fromEntries(expenseListSearchParams(params)),
    EXPENSE_SORT,
    { sort: params.sort, dir: params.dir },
  );

  return (
    <div>
      <ExpenseLiveRefresh initialFingerprint={emailFingerprint} />
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Expenses</h1>
          <p className="mt-1 text-muted">Log spend and attach receipts.</p>
        </div>
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            <ExpenseImportButton canWrite={canWrite} />
            <Link href="/expenses/new" className={buttonClasses("primary")}>
              New expense
            </Link>
          </div>
        )}
      </div>

      {inboundAlias ? (
        <InboundAddress
          alias={inboundAlias}
          domain={inboundMailboxConfig().domain}
          legacyAddress={legacyInboundAddress}
        />
      ) : null}

      {reimbSummary.count > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-wash/50 px-4 py-3 text-sm">
          <span>
            <span className="font-medium text-foreground">{reimbSummary.count}</span>{" "}
            reimbursable expenses totalling{" "}
            <span className="font-medium text-foreground">{reimbSummary.totalFormatted}</span>
          </span>
          <Link
            href="/reimbursements"
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            Create reimbursement run →
          </Link>
        </div>
      )}

      <nav aria-label="Whose expenses" className="mt-4 flex flex-wrap gap-2">
        <Link
          href={expenseListHref(params, { mine: false })}
          aria-current={myReimbursable ? undefined : "page"}
          scroll={false}
          className={buttonClasses(myReimbursable ? "ghost" : "secondary", "text-sm")}
        >
          All
        </Link>
        {localUserId && (
          <Link
            // Status and payer are fixed by this view, so drop them rather than hide them.
            href={expenseListHref(params, { mine: true, status: "", paidBy: "" })}
            aria-current={myReimbursable ? "page" : undefined}
            scroll={false}
            className={buttonClasses(myReimbursable ? "secondary" : "ghost", "text-sm")}
          >
            My reimbursable
          </Link>
        )}
      </nav>

      <div className="mt-4">
        <ExpenseFilters
          params={params}
          categories={EXPENSE_CATEGORIES}
          founders={founders.map((f) => ({ id: f.id, label: f.name || f.email }))}
        />
      </div>

      <div className="mt-6">
        {rows.length === 0 ? (
          filtered || myReimbursable ? (
            <p className="text-sm text-muted">No expenses match these filters.</p>
          ) : (
            <EmptyState
              title="No expenses yet"
              description="Log spend with New expense, import a CSV, or email a receipt."
              actionHref={canWrite ? "/expenses/new" : undefined}
              actionLabel={canWrite ? "New expense" : undefined}
            />
          )
        ) : (
          <>
          {filtered ? (
            <p className="mb-2 text-sm text-muted" aria-live="polite">
              {rows.length} {rows.length === 1 ? "expense" : "expenses"} match these filters.
            </p>
          ) : null}
          <Table>
            <THead>
              <TR>
                {sortHeader("Date", "date")}
                {sortHeader("Description", "description")}
                {sortHeader("Category", "category")}
                {sortHeader("Paid by", "paidBy")}
                {sortHeader("Created by", "createdBy")}
                {sortHeader("Status", "status")}
                <TH>Bank</TH>
                {sortHeader("Amount", "amount", "end")}
              </TR>
            </THead>
            <TBody>
              {rows.map((e) => (
                <TR key={e.id} className={e.status === "pending" ? "bg-amber-50/50 dark:bg-amber-950/20" : undefined}>
                  <TD className="text-muted">{e.spentAt ?? "—"}</TD>
                  <TD>
                    <Link
                      href={`/expenses/${e.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {e.description}
                    </Link>
                    {e.clientName ? (
                      <span className="ml-2 text-xs text-muted">
                        {e.billable ? "Rebill → " : "For "}
                        {e.clientName}
                      </span>
                    ) : null}
                    {e.status === "pending" && e.externalSenderEmail ? (
                      <span className="block text-xs text-amber-800 dark:text-amber-200">
                        Sent by {e.externalSenderEmail}, check before approving
                      </span>
                    ) : null}
                  </TD>
                  <TD>{e.category ?? "—"}</TD>
                  <TD>{e.paidByName ?? "—"}</TD>
                  <TD>{e.createdByName ?? "—"}</TD>
                  <TD>
                    {expenseStatusLabel(e.status as ExpenseStatus)}
                    {paymentSourceListLabel(paymentSources.get(e.id)) ? (
                      <span className="block text-xs text-muted">
                        {paymentSourceListLabel(paymentSources.get(e.id))}
                      </span>
                    ) : null}
                  </TD>
                  <TD>
                    {e.bankLinked ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-medium text-success">
                        <Link2 className="h-3 w-3" aria-hidden />
                        Linked
                      </span>
                    ) : (
                      <span className="text-muted" title="Not linked to a bank transaction">
                        —
                      </span>
                    )}
                  </TD>
                  <TD className="text-right font-medium">{e.amountFormatted}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          </>
        )}
      </div>
    </div>
  );
}
