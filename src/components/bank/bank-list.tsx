import Link from 'next/link';
import { CategoryCell, ReconciliationCell } from '@/components/bank/bank-ui';
import { SortableTH } from '@/components/ui/sortable-th';
import { BankPageSizeSelect } from '@/components/bank/bank-page-size-select';
import { Card } from '@/components/ui/card';
import { buttonClasses } from '@/components/ui/button';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { formatBankCategory } from '@/lib/bank/categories';
import {
    bankListHref,
    groupByBookedAt,
    BANK_SORT,
    type BankListParams,
    type BankSortColumn,
} from '@/lib/bank/list-params';
import { nextTableSort } from '@/lib/table-sort';
import type { BankTransactionListItem } from '@/lib/bank/queries';
import { friendlyDayLabel } from '@/lib/dates';
import { cn } from '@/lib/utils';

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
    return (
        <span className="text-sm">
            {formatBankCategory(row.spendingCategory)}
        </span>
    );
}

export function BankViewToggle({ params }: { params: BankListParams }) {
    const options = [
        { value: 'table' as const, label: 'Table' },
        { value: 'cards' as const, label: 'Cards' },
    ];
    return (
        <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Transaction layout"
        >
            {options.map((option) => {
                const active = params.view === option.value;
                const href =
                    option.value === 'cards'
                        ? bankListHref(params, { view: 'cards', page: 1 })
                        : bankListHref(params, { view: 'table' });
                return (
                    <Link
                        key={option.value}
                        href={href}
                        className={cn(
                            'inline-flex items-center rounded-full px-3 py-1.5 text-sm transition-colors',
                            active
                                ? 'bg-navy text-white'
                                : 'border border-border bg-surface text-muted hover:bg-wash hover:text-foreground',
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
    const nextHref =
        page < pageCount ? bankListHref(params, { page: page + 1 }) : null;

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
                    <Link href={prevHref} className={buttonClasses('ghost')}>
                        Previous
                    </Link>
                ) : (
                    <span
                        className={cn(
                            buttonClasses('ghost'),
                            'pointer-events-none opacity-40',
                        )}
                    >
                        Previous
                    </span>
                )}
                <span>
                    Page {page} of {pageCount}
                </span>
                {nextHref ? (
                    <Link href={nextHref} className={buttonClasses('ghost')}>
                        Next
                    </Link>
                ) : (
                    <span
                        className={cn(
                            buttonClasses('ghost'),
                            'pointer-events-none opacity-40',
                        )}
                    >
                        Next
                    </span>
                )}
            </div>
        </div>
    );
}

function TagsLine({ tags }: { tags: string[] }) {
    if (tags.length === 0) return null;
    return (
        <p className="mt-0.5 text-xs text-muted">{tags.join(', ')}</p>
    );
}

export function BankTransactionTable({
    params,
    rows,
    customCategories,
    incomeCategories,
    canWrite,
    showAccount = false,
}: {
    params: BankListParams;
    rows: BankTransactionListItem[];
    customCategories: readonly string[];
    incomeCategories: readonly string[];
    canWrite: boolean;
    showAccount?: boolean;
}) {
    const sortHeader = (
        label: string,
        column: BankSortColumn,
        align?: 'start' | 'end',
    ) => (
        <SortableTH
            label={label}
            href={bankListHref(params, {
                ...nextTableSort(BANK_SORT, params, column),
                page: 1,
            })}
            active={params.sort === column}
            dir={params.dir}
            align={align}
        />
    );
    return (
        <Table>
            <THead>
                <TR>
                    {sortHeader('Date', 'date')}
                    {sortHeader('Counterparty', 'counterparty')}
                    {showAccount ? <TH>Account</TH> : null}
                    {sortHeader('Reference', 'reference')}
                    {sortHeader('Category', 'category')}
                    {sortHeader('Amount', 'amount', 'end')}
                    <TH>Reconciliation</TH>
                </TR>
            </THead>
            <TBody>
                {rows.map((r) => (
                    <TR key={r.id}>
                        <TD className="text-muted">{r.bookedAt}</TD>
                        <TD>
                            {r.counterparty ?? r.description ?? '—'}
                            <TagsLine tags={r.tags} />
                        </TD>
                        {showAccount ? (
                            <TD className="text-muted">{r.bankAccountName || '—'}</TD>
                        ) : null}
                        <TD className="text-muted">{r.reference ?? '—'}</TD>
                        <TD>
                            <CategoryDisplay
                                row={r}
                                customCategories={customCategories}
                                canWrite={canWrite}
                            />
                        </TD>
                        <TD className="text-right font-medium">
                            {r.amountFormatted}
                        </TD>
                        <TD>
                            <ReconciliationCell
                                row={r}
                                canWrite={canWrite}
                                incomeCategories={incomeCategories}
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
    incomeCategories,
    canWrite,
    showAccount = false,
}: {
    row: BankTransactionListItem;
    customCategories: readonly string[];
    incomeCategories: readonly string[];
    canWrite: boolean;
    showAccount?: boolean;
}) {
    return (
        <Card className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">
                            {row.counterparty ?? row.description ?? '—'}
                        </p>
                        <CategoryDisplay
                            row={row}
                            customCategories={customCategories}
                            canWrite={canWrite}
                        />
                    </div>
                    <TagsLine tags={row.tags} />
                    <p className="mt-0.5 text-sm text-muted">
                        {row.reference ?? '—'}
                        {showAccount && row.bankAccountName
                            ? ` · ${row.bankAccountName}`
                            : ''}
                    </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                    <p
                        className={cn(
                            'font-medium tabular-nums',
                            row.amountPence > 0
                                ? 'text-success'
                                : 'text-foreground',
                        )}
                    >
                        {row.amountFormatted}
                    </p>
                    <ReconciliationCell
                        row={row}
                        canWrite={canWrite}
                        incomeCategories={incomeCategories}
                        align="end"
                    />
                </div>
            </div>
        </Card>
    );
}

export function BankTransactionCardList({
    rows,
    customCategories,
    incomeCategories,
    canWrite,
    showAccount = false,
}: {
    rows: BankTransactionListItem[];
    customCategories: readonly string[];
    incomeCategories: readonly string[];
    canWrite: boolean;
    showAccount?: boolean;
}) {
    const groups = groupByBookedAt(rows, (iso) => friendlyDayLabel(iso));
    return (
        <div className="space-y-8">
            {groups.map((group) => (
                <section key={group.date}>
                    <h2 className="font-display text-lg font-semibold">
                        {group.label}
                    </h2>
                    <div className="mt-3 grid gap-3">
                        {group.items.map((r) => (
                            <BankTransactionCard
                                key={r.id}
                                row={r}
                                customCategories={customCategories}
                                incomeCategories={incomeCategories}
                                canWrite={canWrite}
                                showAccount={showAccount}
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
    incomeCategories,
    canWrite,
    showAccount = false,
}: {
    rows: BankTransactionListItem[];
    customCategories: readonly string[];
    incomeCategories: readonly string[];
    canWrite: boolean;
    showAccount?: boolean;
}) {
    return (
        <BankTransactionCardList
            rows={rows}
            customCategories={customCategories}
            incomeCategories={incomeCategories}
            canWrite={canWrite}
            showAccount={showAccount}
        />
    );
}
