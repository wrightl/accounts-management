import Link from "next/link";
import { CategoryCell, MatchActions } from "@/components/bank/bank-ui";
import { BankPageSizeSelect } from "@/components/bank/bank-page-size-select";
import { BankPeriodRangeSelect } from "@/components/period/bank-period-range-select";
import { Card } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/form";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import {
  bankCategorySelectOptions,
  formatBankCategory,
} from "@/lib/bank/categories";
import {
  BANK_PAGE_SIZE,
  bankListHref,
  groupByBookedAt,
  hasActiveBankFilters,
  type BankListParams,
} from "@/lib/bank/list-params";
import type { BankTransactionListItem } from "@/lib/bank/queries";
import { friendlyDayLabel } from "@/lib/dates";
import { cn } from "@/lib/utils";

function matchStatus(row: BankTransactionListItem): string {
  if (row.reconciled) return `Matched (${row.matchType})`;
  if (row.suggested) return `Suggested (${row.matchType})`;
  return "Unreconciled";
}

function CategoryDisplay({
  row,
  customCategories,
  canWrite,
}: {
  row: BankTransactionListItem;
  customCategories: readonly string[];
  canWrite: boolean;
}) {
  if (canWrite) {
    return (
      <CategoryCell
        transactionId={row.id}
        spendingCategory={row.spendingCategory}
        customCategories={customCategories}
        canWrite={canWrite}
      />
    );
  }
  return <span className="text-sm">{formatBankCategory(row.spendingCategory)}</span>;
}

export function BankFilters({
  params,
  customCategories,
}: {
  params: BankListParams;
  customCategories: readonly string[];
}) {
  const categoryOptions = bankCategorySelectOptions(customCategories);
  return (
    <form
      method="get"
      action="/dashboard/transactions"
      className="mt-6 grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-6"
    >
      <input type="hidden" name="view" value={params.view} />
      {params.pageSize !== BANK_PAGE_SIZE ? (
        <input type="hidden" name="pageSize" value={params.pageSize} />
      ) : null}
      <div className="sm:col-span-2 lg:col-span-2">
        <Label htmlFor="q">Search</Label>
        <Input
          id="q"
          name="q"
          type="search"
          placeholder="Counterparty, reference…"
          defaultValue={params.q}
        />
      </div>
      <div>
        <Label htmlFor="type">Type</Label>
        <Select id="type" name="type" defaultValue={params.type}>
          <option value="">All</option>
          <option value="incoming">Incoming</option>
          <option value="outgoing">Outgoing</option>
        </Select>
      </div>
      <div>
        <Label htmlFor="category">Category</Label>
        <Select id="category" name="category" defaultValue={params.category}>
          <option value="">All</option>
          {categoryOptions.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <BankPeriodRangeSelect params={params} />
      </div>
      <div className="flex flex-wrap items-end gap-3 sm:col-span-2 lg:col-span-6">
        <button type="submit" className={buttonClasses("secondary")}>
          Filter
        </button>
        {hasActiveBankFilters(params) ? (
          <Link
            href={bankListHref(params, {
              q: "",
              type: "",
              category: "",
              period: "",
              from: "",
              to: "",
              page: 1,
            })}
            className="text-sm text-muted hover:text-foreground hover:underline"
          >
            Clear
          </Link>
        ) : null}
      </div>
    </form>
  );
}

export function BankViewToggle({ params }: { params: BankListParams }) {
  const options = [
    { value: "table" as const, label: "Table" },
    { value: "cards" as const, label: "Cards" },
  ];
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Transaction layout">
      {options.map((option) => {
        const active = params.view === option.value;
        const href =
          option.value === "cards"
            ? bankListHref(params, { view: "cards", page: 1 })
            : bankListHref(params, { view: "table" });
        return (
          <Link
            key={option.value}
            href={href}
            className={cn(
              "inline-flex items-center rounded-full px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-navy text-white"
                : "border border-border bg-surface text-muted hover:bg-wash hover:text-foreground",
            )}
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}

export function BankPagination({
  params,
  total,
  page,
  pageSize,
  pageCount,
}: {
  params: BankListParams;
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const prevHref = page > 1 ? bankListHref(params, { page: page - 1 }) : null;
  const nextHref = page < pageCount ? bankListHref(params, { page: page + 1 }) : null;

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
      <div className="flex flex-wrap items-center gap-4">
        <p>
          Showing {from}–{to} of {total}
        </p>
        <BankPageSizeSelect params={params} />
      </div>
      <div className="flex items-center gap-2">
        {prevHref ? (
          <Link href={prevHref} className={buttonClasses("ghost")}>
            Previous
          </Link>
        ) : (
          <span className={cn(buttonClasses("ghost"), "pointer-events-none opacity-40")}>
            Previous
          </span>
        )}
        <span>
          Page {page} of {pageCount}
        </span>
        {nextHref ? (
          <Link href={nextHref} className={buttonClasses("ghost")}>
            Next
          </Link>
        ) : (
          <span className={cn(buttonClasses("ghost"), "pointer-events-none opacity-40")}>
            Next
          </span>
        )}
      </div>
    </div>
  );
}

export function BankTransactionTable({
  rows,
  customCategories,
  canWrite,
}: {
  rows: BankTransactionListItem[];
  customCategories: readonly string[];
  canWrite: boolean;
}) {
  return (
    <Table>
      <THead>
        <TR>
          <TH>Date</TH>
          <TH>Counterparty</TH>
          <TH>Reference</TH>
          <TH>Category</TH>
          <TH>Status</TH>
          <TH className="text-right">Amount</TH>
          <TH />
        </TR>
      </THead>
      <TBody>
        {rows.map((r) => (
          <TR key={r.id}>
            <TD className="text-muted">{r.bookedAt}</TD>
            <TD>{r.counterparty ?? r.description ?? "—"}</TD>
            <TD className="text-muted">{r.reference ?? "—"}</TD>
            <TD>
              <CategoryDisplay row={r} customCategories={customCategories} canWrite={canWrite} />
            </TD>
            <TD className="text-sm">{matchStatus(r)}</TD>
            <TD className="text-right font-medium">{r.amountFormatted}</TD>
            <TD>
              <MatchActions
                matchId={r.matchId}
                confirmed={r.confirmed}
                canWrite={canWrite}
              />
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

function BankTransactionCard({
  row,
  customCategories,
  canWrite,
}: {
  row: BankTransactionListItem;
  customCategories: readonly string[];
  canWrite: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{row.counterparty ?? row.description ?? "—"}</p>
            <CategoryDisplay
              row={row}
              customCategories={customCategories}
              canWrite={canWrite}
            />
          </div>
          <p className="mt-0.5 text-sm text-muted">{row.reference ?? "—"}</p>
        </div>
        <p
          className={cn(
            "shrink-0 font-medium tabular-nums",
            row.amountPence > 0 ? "text-success" : "text-foreground",
          )}
        >
          {row.amountFormatted}
        </p>
      </div>
      <div className="mt-3 flex justify-end">
        <MatchActions
          matchId={row.matchId}
          confirmed={row.confirmed}
          canWrite={canWrite}
        />
      </div>
    </Card>
  );
}

export function BankTransactionCardList({
  rows,
  customCategories,
  canWrite,
}: {
  rows: BankTransactionListItem[];
  customCategories: readonly string[];
  canWrite: boolean;
}) {
  const groups = groupByBookedAt(rows, (iso) => friendlyDayLabel(iso));
  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section key={group.date}>
          <h2 className="font-display text-lg font-semibold">{group.label}</h2>
          <div className="mt-3 grid gap-3">
            {group.items.map((r) => (
              <BankTransactionCard
                key={r.id}
                row={r}
                customCategories={customCategories}
                canWrite={canWrite}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function BankTransactionCards({
  rows,
  customCategories,
  canWrite,
}: {
  rows: BankTransactionListItem[];
  customCategories: readonly string[];
  canWrite: boolean;
}) {
  return (
    <BankTransactionCardList
      rows={rows}
      customCategories={customCategories}
      canWrite={canWrite}
    />
  );
}
