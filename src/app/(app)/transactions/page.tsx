import { guardTenantPage, hasPermission } from "@/lib/auth";
import { recordScopeFor, withoutTeamAnnotations } from "@/lib/accountant/record-scope";
import { can } from "@/lib/roles";
import { countBankAccounts, listBankTransactions } from "@/lib/bank/queries";
import { listBankAccountCards } from "@/lib/bank/company-cards";
import { getBankTransactionSummary } from "@/lib/bank/summary";
import { parseBankListParams, hasActiveBankFilters, BANK_PAGE_SIZE, resolveBankListDateRange } from "@/lib/bank/list-params";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { BankToolbar } from "@/components/bank/bank-ui";
import { SetupStepBanner } from "@/components/data-onboarding/setup-step-banner";
import { BankFilters } from "@/components/bank/bank-filters";
import {
  BankPagination,
  BankTransactionTable,
  BankViewToggle,
} from "@/components/bank/bank-list";
import { BankCardsFeed } from "@/components/bank/bank-cards-feed";
import {
  BankBulkActions,
  BankSelectionProvider,
} from "@/components/bank/bank-selection";
import {
  BankListPositionRestorer,
  NewExpenseFromBankListLink,
} from "@/components/bank/bank-list-position";
import { TransactionsSummaryPanel } from "@/components/bank/transactions-summary";
import { listBankSpendingCategoriesWithUsage } from "@/lib/bank/spending-categories";
import { listIncomeCategoryNames } from "@/lib/bank/income-category-catalog";
import { EmptyState } from "@/components/ui/empty-state";
import { getDateFormat } from "@/lib/date-format.server";
import { listLabels } from "@/lib/labels/queries";
import { recordQueriesFor } from "@/lib/queries/queries";
import { PageHeader } from "@/components/ui/page-header";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { companyId, role, entityType } = await guardTenantPage("records:read");
  const inPack = recordScopeFor(role) === "pack";
  const canRaiseQuery = can(role, "queries:raise");
  const canWrite = await hasPermission("accounts:write");
  const sp = await searchParams;
  const parsed = parseBankListParams(sp);

  const [settings, labels] = await Promise.all([
    getOrCreateCompanySettings(companyId),
    inPack ? [] : listLabels(companyId),
  ]);
  // A link can outlive a label; a deleted one shouldn't empty the list.
  const params = {
    ...parsed,
    labels: inPack ? [] : parsed.labels.filter((id) => labels.some((l) => l.id === id)),
  };
  const dateRange = resolveBankListDateRange(params, settings.financialYearEndMonth);

  const listFilters =
    params.view === "cards"
      ? {
          q: params.q,
          type: params.type,
          category: params.category,
          reconciliation: params.reconciliation,
          labels: params.labels,
          from: dateRange.from,
          to: dateRange.to,
          page: 1,
          pageSize: BANK_PAGE_SIZE,
        }
      : {
          q: params.q,
          type: params.type,
          category: params.category,
          reconciliation: params.reconciliation,
          labels: params.labels,
          from: dateRange.from,
          to: dateRange.to,
          page: params.page,
          pageSize: params.pageSize,
          sort: params.sort,
          dir: params.dir,
        };

  const summaryFilters = {
    q: params.q,
    type: params.type,
    category: params.category,
    reconciliation: params.reconciliation,
    labels: params.labels,
    from: dateRange.from,
    to: dateRange.to,
  };

  const [
    { rows: listedRows, total, page, pageSize, pageCount },
    summary,
    customCategories,
    incomeCategories,
    bankAccountCount,
    accountCards,
  ] = await Promise.all([
    listBankTransactions(companyId, { ...listFilters, scope: inPack ? "pack" : "all" }),
    getBankTransactionSummary(companyId, summaryFilters, await getDateFormat()),
    listBankSpendingCategoriesWithUsage(companyId),
    listIncomeCategoryNames(companyId),
    countBankAccounts(companyId),
    inPack ? [] : listBankAccountCards(companyId),
  ]);
  const queries = await recordQueriesFor(role, companyId, "bank_transaction", listedRows.map((r) => r.id));
  const rows = (inPack ? listedRows.map(withoutTeamAnnotations) : listedRows).map((r) => ({
    ...r,
    queries: queries.get(r.id),
  }));

  const customCategoryNames = customCategories.map((c) => c.name);
  // Ticking rows for bulk labels and explanations; table view only.
  const selectable = canWrite && !inPack && params.view === "table";
  const selectableRows = rows.map((r) => ({
    id: r.id,
    needsExplanation: r.amountPence > 0 && !r.reconciled,
  }));
  const showAccount = bankAccountCount > 1;

  return (
    <div>
      <SetupStepBanner stepId="bank" entityType={entityType} from={sp.from} />
      <PageHeader
        title="Transactions"
        description={
          <>
            <p>
              {inPack
                ? "Bank transactions and how they were reconciled."
                : "Import bank CSV and reconcile against payments and expenses."}
            </p>
            {canWrite ? (
              <p className="mt-1 text-sm">
                Paid for something from a personal account?{" "}
                <NewExpenseFromBankListLink
                  params={{ status: "reimbursable" }}
                  className="font-medium text-navy underline underline-offset-2 hover:no-underline"
                >
                  Add it as a reimbursable expense
                </NewExpenseFromBankListLink>
                .
              </p>
            ) : null}
          </>
        }
        actions={
          <BankToolbar
            canWrite={canWrite}
            customCategories={customCategories}
            accountCards={accountCards}
            importOpenByDefault={sp.import === "1"}
            labels={inPack ? undefined : labels}
          />
        }
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_280px] xl:grid-cols-[1fr_320px]">
        <div>
          <BankFilters params={params} customCategories={customCategoryNames} labels={inPack ? [] : labels} />

          <BankSelectionProvider
            key={JSON.stringify(params)}
            rows={selectable ? selectableRows : []}
          >
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <BankViewToggle params={params} />
              {selectable ? (
                <BankBulkActions allLabels={labels} incomeCategories={incomeCategories} />
              ) : null}
            </div>

            <div className="mt-4">
              {rows.length === 0 ? (
                hasActiveBankFilters(params) ? (
                  <p className="text-sm text-muted">
                    No transactions match these filters.
                  </p>
                ) : (
                  <EmptyState
                    title="No transactions imported yet"
                    description="Export a CSV from your bank, then use Import above to match payments to invoices."
                  />
                )
              ) : params.view === "cards" ? (
                <BankCardsFeed
                  initialRows={rows}
                  initialPage={page}
                  pageCount={pageCount}
                  total={total}
                  filters={{
                    q: params.q,
                    type: params.type,
                    category: params.category,
                    reconciliation: params.reconciliation,
                    labels: params.labels,
                    from: dateRange.from,
                    to: dateRange.to,
                  }}
                  customCategories={customCategoryNames}
                  incomeCategories={incomeCategories}
                  allLabels={labels}
                  canWrite={canWrite}
                  canRaiseQuery={canRaiseQuery}
                  showAccount={showAccount}
                />
              ) : (
                <BankTransactionTable
                  params={params}
                  rows={rows}
                  customCategories={customCategoryNames}
                  incomeCategories={incomeCategories}
                  allLabels={labels}
                  canWrite={canWrite}
                  canRaiseQuery={canRaiseQuery}
                  showAccount={showAccount}
                  selectable={selectable}
                />
              )}
            </div>
          </BankSelectionProvider>

          {params.view === "table" ? (
            <BankPagination
              params={params}
              total={total}
              page={page}
              pageSize={pageSize}
              pageCount={pageCount}
            />
          ) : null}
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <TransactionsSummaryPanel summary={summary} />
        </aside>
      </div>
      <BankListPositionRestorer />
    </div>
  );
}
