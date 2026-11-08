import Link from "next/link";
import { Link2 } from "lucide-react";
import { guardTenantPage, hasPermission, requireUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { recordScopeFor, forAccountant } from "@/lib/accountant/record-scope";
import {
  findPossibleDuplicates,
  getEmailExpensesFingerprint,
  getReimbursableSummary,
  listExpensePage,
  listFounders,
} from "@/lib/expenses/queries";
import {
  EXPENSE_CATEGORIES,
  expenseStatusLabel,
  type ExpenseStatus,
} from "@/lib/expenses/categories";
import {
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
import { SetupStepBanner } from "@/components/data-onboarding/setup-step-banner";
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
import { DisplayDate } from "@/components/date-format-provider";
import { ManageLabelsButton } from "@/components/labels/manage-labels";
import { RowLabels } from "@/components/labels/row-labels";
import { RowNote } from "@/components/labels/row-note";
import { ListPagination } from "@/components/ui/list-pagination";
import { RecordQueryIcon } from "@/components/queries/record-query-icon";
import { recordQueriesFor } from "@/lib/queries/queries";
import { listLabels } from "@/lib/labels/queries";
import { PageHeader } from "@/components/ui/page-header";
import { PossibleDuplicateChip } from "@/components/expenses/possible-duplicates";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { companyId, role, entityType } = await guardTenantPage("records:read");
  const scope = recordScopeFor(role);
  const canWrite = await hasPermission("accounts:write");
  const canRaiseQuery = can(role, "queries:raise");
  const user = await requireUser();
  const sp = await searchParams;
  const parsed = parseExpenseListParams(sp);

  const [localUser, settings, labels] = await Promise.all([
    findLocalUser(user.userId),
    getOrCreateCompanySettings(companyId),
    scope === "all" ? listLabels(companyId) : [],
  ]);
  const localUserId = localUser?.id ?? null;
  const params = {
    ...parsed,
    mine: parsed.mine && Boolean(localUserId) && scope === "all",
    // A link can outlive a label; a deleted one shouldn't empty the list.
    labels: scope === "all" ? parsed.labels.filter((id) => labels.some((l) => l.id === id)) : [],
  };
  const myReimbursable = params.mine;
  const dateRange = resolveExpenseListDateRange(params, settings.financialYearEndMonth);
  const filtered = hasActiveExpenseFilters(params);

  const [{ rows: listed, ...paging }, founders, reimbSummary, company, emailFingerprint] = await Promise.all([
    listExpensePage(companyId, {
      q: params.q,
      from: dateRange.from,
      to: dateRange.to,
      category: params.category,
      paidByUserId: myReimbursable ? localUserId! : params.paidBy,
      billable: params.billable,
      status: myReimbursable ? "reimbursable" : params.status,
      labels: params.labels,
      sort: { sort: params.sort, dir: params.dir },
      scope,
      page: params.page,
      pageSize: params.pageSize,
    }),
    listFounders(companyId),
    getReimbursableSummary(companyId),
    getCompany(companyId),
    getEmailExpensesFingerprint(companyId),
  ]);

  const rows =
    scope === "pack"
      ? listed.map((r) => ({ ...forAccountant(r), createdByName: null }))
      : listed;

  const queries = await recordQueriesFor(role, companyId, "expense", rows.map((r) => r.id));

  const pendingIds = rows.filter((r) => r.status === "pending").map((r) => r.id);
  const [paymentSources, duplicates] = await Promise.all([
    getPaymentSourceSuggestions(companyId, pendingIds),
    findPossibleDuplicates(companyId, scope === "all" ? pendingIds : []),
  ]);

  const isFounder = localUser?.role === "admin" || localUser?.role === "user";
  // Given out when someone becomes a founder, and backfilled for earlier founders.
  const inboundAlias =
    localUser && isFounder ? await getInboundAlias(localUser.id, companyId) : null;
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
      {scope === "all" ? <ExpenseLiveRefresh initialFingerprint={emailFingerprint} /> : null}
      <SetupStepBanner stepId="expenses" entityType={entityType} from={sp.from} />
      <PageHeader
        title="Expenses"
        description="Log spend and attach receipts."
        actions={
          canWrite ? (
            <>
              <ManageLabelsButton labels={labels} />
              <ExpenseImportButton canWrite={canWrite} defaultOpen={sp.import === "1"} />
              <Link href="/expenses/new" className={buttonClasses("primary")}>
                New expense
              </Link>
            </>
          ) : null
        }
      />

      {inboundAlias ? (
        <InboundAddress
          alias={inboundAlias}
          domain={inboundMailboxConfig().domain}
          legacyAddress={legacyInboundAddress}
        />
      ) : null}

      {scope === "all" && reimbSummary.count > 0 && (
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

      {scope === "all" ? (
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
      ) : null}

      <div className="mt-4">
        <ExpenseFilters
          params={params}
          categories={EXPENSE_CATEGORIES}
          founders={founders.map((f) => ({ id: f.id, label: f.name || f.email }))}
          labels={scope === "all" ? labels : []}
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
                <TH className="w-8 pr-0">
                  <span className="sr-only">Notes and queries</span>
                </TH>
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
                <TR
                  key={e.id}
                  className={e.status === "pending" ? "bg-amber-100 hover:bg-amber-200/70" : undefined}
                >
                  <TD
                    className={
                      e.status === "pending"
                        ? "w-8 pr-0 shadow-[inset_4px_0_0_var(--color-amber-500)]"
                        : "w-8 pr-0"
                    }
                  >
                    <RowNote
                      kind="expense"
                      rowId={e.id}
                      note={e.notes}
                      shared={e.noteSharedWithAccountant}
                      canWrite={canWrite}
                    />
                    <RecordQueryIcon
                      recordKind="expense"
                      recordId={e.id}
                      queries={queries.get(e.id)}
                      canRaise={canRaiseQuery}
                    />
                  </TD>
                  <TD className="text-muted"><DisplayDate value={e.spentAt} /></TD>
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
                      <span className="block text-xs text-amber-800">
                        Sent by {e.externalSenderEmail}, check before approving
                      </span>
                    ) : null}
                    {duplicates.get(e.id) ? (
                      <PossibleDuplicateChip matches={duplicates.get(e.id)!} />
                    ) : null}
                    <RowLabels
                      kind="expense"
                      rowId={e.id}
                      labels={e.labels}
                      allLabels={labels}
                      canWrite={canWrite}
                    />
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
        <ListPagination
          {...paging}
          href={(to) => expenseListHref(params, to as Partial<typeof params>)}
        />
      </div>
    </div>
  );
}
