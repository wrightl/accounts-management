import { guardTenantPage, hasPermission } from "@/lib/auth";
import { listBankTransactions } from "@/lib/bank/queries";
import { getBankTransactionSummary } from "@/lib/bank/summary";
import { parseBankListParams, hasActiveBankFilters, BANK_PAGE_SIZE, resolveBankListDateRange } from "@/lib/bank/list-params";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { BankToolbar, CustomCategoriesPanel } from "@/components/bank/bank-ui";
import {
  BankFilters,
  BankPagination,
  BankTransactionTable,
  BankViewToggle,
} from "@/components/bank/bank-list";
import { BankCardsFeed } from "@/components/bank/bank-cards-feed";
import { TransactionsSummaryPanel } from "@/components/bank/transactions-summary";
import { listBankSpendingCategoriesWithUsage } from "@/lib/bank/spending-categories";
import { isDatabaseConfigured } from "@/env";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { companyId } = await guardTenantPage("accounts:read");
  const canWrite = await hasPermission("accounts:write");
  const params = parseBankListParams(await searchParams);

  if (!isDatabaseConfigured()) {
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold">Transactions</h1>
        <p className="mt-2 text-muted">Connect a database to import statements.</p>
      </div>
    );
  }

  const settings = await getOrCreateCompanySettings(companyId);
  const dateRange = resolveBankListDateRange(params, settings.financialYearEndMonth);

  const listFilters =
    params.view === "cards"
      ? {
          q: params.q,
          type: params.type,
          category: params.category,
          reconciliation: params.reconciliation,
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
          from: dateRange.from,
          to: dateRange.to,
          page: params.page,
          pageSize: params.pageSize,
        };

  const summaryFilters = {
    q: params.q,
    type: params.type,
    category: params.category,
    reconciliation: params.reconciliation,
    from: dateRange.from,
    to: dateRange.to,
  };

  const [{ rows, total, page, pageSize, pageCount }, summary, customCategories] =
    await Promise.all([
      listBankTransactions(companyId, listFilters),
      getBankTransactionSummary(companyId, summaryFilters),
      listBankSpendingCategoriesWithUsage(companyId),
    ]);

  const customCategoryNames = customCategories.map((c) => c.name);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Transactions</h1>
          <p className="mt-1 text-muted">
            Import Starling CSV and reconcile against payments and expenses.
          </p>
        </div>
        <BankToolbar canWrite={canWrite} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_280px] xl:grid-cols-[1fr_320px]">
        <div>
          <BankFilters params={params} customCategories={customCategoryNames} />

          <CustomCategoriesPanel categories={customCategories} canWrite={canWrite} />

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <BankViewToggle params={params} />
          </div>

          <div className="mt-4">
            {rows.length === 0 ? (
              <p className="text-sm text-muted">
                {hasActiveBankFilters(params)
                  ? "No transactions match these filters."
                  : "No transactions imported yet."}
              </p>
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
                  from: dateRange.from,
                  to: dateRange.to,
                }}
                customCategories={customCategoryNames}
                canWrite={canWrite}
              />
            ) : (
              <BankTransactionTable
                rows={rows}
                customCategories={customCategoryNames}
                canWrite={canWrite}
              />
            )}
          </div>

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
    </div>
  );
}
