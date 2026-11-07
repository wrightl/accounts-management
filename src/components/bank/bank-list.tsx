import Link from 'next/link';
import { RecordQueryIcon } from '@/components/queries/record-query-icon';
import { CategoryCell, ReconciliationCell } from '@/components/bank/bank-ui';
import { SortableTH } from '@/components/ui/sortable-th';
import { ListPagination } from '@/components/ui/list-pagination';
import { Card } from '@/components/ui/card';
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
import { RowLabels } from '@/components/labels/row-labels';
import {
    RowSelectCheckbox,
    SelectAllCheckbox,
} from '@/components/bank/bank-selection';
import { RowNote } from '@/components/labels/row-note';
import type { RowLabel } from '@/lib/labels/queries';
import { cn } from '@/lib/utils';
import { FriendlyDay } from "@/components/date-format-provider";
import { DisplayDate } from '@/components/date-format-provider';

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
    return (
        <ListPagination
            total={total}
            page={page}
            pageSize={pageSize}
            pageCount={pageCount}
            href={(to) => bankListHref(params, to as Partial<BankListParams>)}
        />
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
    allLabels,
    canWrite,
    canRaiseQuery = false,
    showAccount = false,
    selectable = false,
}: {
    params: BankListParams;
    rows: BankTransactionListItem[];
    customCategories: readonly string[];
    incomeCategories: readonly string[];
    allLabels: readonly RowLabel[];
    canWrite: boolean;
    canRaiseQuery?: boolean;
    showAccount?: boolean;
    /** Inside a BankSelectionProvider: show a checkbox on each row. */
    selectable?: boolean;
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
                    {selectable ? (
                        <TH className="w-8 pr-0">
                            <SelectAllCheckbox />
                        </TH>
                    ) : null}
                    <TH className="w-8 pr-0">
                        <span className="sr-only">Notes and queries</span>
                    </TH>
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
                        {selectable ? (
                            <TD className="w-8 pr-0">
                                <RowSelectCheckbox
                                    id={r.id}
                                    label={`${r.counterparty ?? r.description ?? 'transaction'} ${r.amountFormatted}`}
                                />
                            </TD>
                        ) : null}
                        <TD className="w-8 pr-0">
                            <RowNote
                                kind="bank"
                                rowId={r.id}
                                note={r.notes}
                                canWrite={canWrite}
                            />
                            <RecordQueryIcon
                                recordKind="bank_transaction"
                                recordId={r.id}
                                queries={r.queries}
                                canRaise={canRaiseQuery}
                            />
                        </TD>
                        <TD className="text-muted"><DisplayDate value={r.bookedAt} /></TD>
                        <TD>
                            {r.counterparty ?? r.description ?? '—'}
                            <TagsLine tags={r.tags} />
                            <RowLabels
                                kind="bank"
                                rowId={r.id}
                                labels={r.labels}
                                allLabels={allLabels}
                                canWrite={canWrite}
                            />
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
    allLabels,
    canWrite,
    canRaiseQuery = false,
    showAccount = false,
}: {
    row: BankTransactionListItem;
    customCategories: readonly string[];
    incomeCategories: readonly string[];
    allLabels: readonly RowLabel[];
    canWrite: boolean;
    canRaiseQuery?: boolean;
    showAccount?: boolean;
}) {
    return (
        <Card className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <RowNote
                            kind="bank"
                            rowId={row.id}
                            note={row.notes}
                            canWrite={canWrite}
                        />
                        <RecordQueryIcon
                            recordKind="bank_transaction"
                            recordId={row.id}
                            queries={row.queries}
                            canRaise={canRaiseQuery}
                        />
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
                    <RowLabels
                        kind="bank"
                        rowId={row.id}
                        labels={row.labels}
                        allLabels={allLabels}
                        canWrite={canWrite}
                    />
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
    allLabels,
    canWrite,
    canRaiseQuery = false,
    showAccount = false,
}: {
    rows: BankTransactionListItem[];
    customCategories: readonly string[];
    incomeCategories: readonly string[];
    allLabels: readonly RowLabel[];
    canWrite: boolean;
    canRaiseQuery?: boolean;
    showAccount?: boolean;
}) {
    const groups = groupByBookedAt(rows, (iso) => iso);
    return (
        <div className="space-y-8">
            {groups.map((group) => (
                <section key={group.date}>
                    <h2 className="font-display text-lg font-semibold">
                        <FriendlyDay iso={group.date} />
                    </h2>
                    <div className="mt-3 grid gap-3">
                        {group.items.map((r) => (
                            <BankTransactionCard
                                key={r.id}
                                row={r}
                                customCategories={customCategories}
                                incomeCategories={incomeCategories}
                                allLabels={allLabels}
                                canWrite={canWrite}
                                canRaiseQuery={canRaiseQuery}
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
    allLabels,
    canWrite,
    canRaiseQuery = false,
    showAccount = false,
}: {
    rows: BankTransactionListItem[];
    customCategories: readonly string[];
    incomeCategories: readonly string[];
    allLabels: readonly RowLabel[];
    canWrite: boolean;
    canRaiseQuery?: boolean;
    showAccount?: boolean;
}) {
    return (
        <BankTransactionCardList
            rows={rows}
            customCategories={customCategories}
            incomeCategories={incomeCategories}
            allLabels={allLabels}
            canWrite={canWrite}
            canRaiseQuery={canRaiseQuery}
            showAccount={showAccount}
        />
    );
}
