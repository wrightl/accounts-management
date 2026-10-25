'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { BankPeriodRangeSelect } from '@/components/period/bank-period-range-select';
import { buttonClasses } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/form';
import { bankCategorySelectOptions } from '@/lib/bank/categories';
import {
    bankListHref,
    hasActiveBankFilters,
    type BankListParams,
} from '@/lib/bank/list-params';
import { cn } from '@/lib/utils';

/**
 * Transaction filters driven entirely by the URL: each dropdown navigates as
 * soon as it changes, so no selection is left unsubmitted and lost when
 * another control (date range, page size, Clear) navigates.
 */
export function BankFilters({
    params,
    customCategories,
}: {
    params: BankListParams;
    customCategories: readonly string[];
}) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const categoryOptions = bankCategorySelectOptions(customCategories);

    const apply = (overrides: Partial<BankListParams>) => {
        startTransition(() => {
            router.push(bankListHref(params, { ...overrides, page: 1 }));
        });
    };

    return (
        <form
            role="search"
            aria-busy={pending}
            onSubmit={(e) => {
                e.preventDefault();
                const q = new FormData(e.currentTarget).get('q');
                apply({ q: typeof q === 'string' ? q.trim().slice(0, 200) : '' });
            }}
            className={cn(
                'grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-6',
                pending && 'opacity-70',
            )}
        >
            <div className="sm:col-span-2 lg:col-span-2">
                <Label htmlFor="q">Search</Label>
                {/* Keyed on the URL value so Clear and back/forward reset the box. */}
                <Input
                    key={params.q}
                    id="q"
                    name="q"
                    type="search"
                    placeholder="Counterparty, reference…"
                    defaultValue={params.q}
                />
            </div>
            <div>
                <Label htmlFor="type">Type</Label>
                <Select
                    id="type"
                    value={params.type}
                    onChange={(e) =>
                        apply({ type: e.target.value as BankListParams['type'] })
                    }
                >
                    <option value="">All</option>
                    <option value="incoming">Incoming</option>
                    <option value="outgoing">Outgoing</option>
                </Select>
            </div>
            <div>
                <Label htmlFor="reconciliation">Reconciliation</Label>
                <Select
                    id="reconciliation"
                    value={params.reconciliation}
                    onChange={(e) =>
                        apply({
                            reconciliation: e.target
                                .value as BankListParams['reconciliation'],
                        })
                    }
                >
                    <option value="">All</option>
                    <option value="reconciled">Reconciled</option>
                    <option value="unreconciled">Unreconciled</option>
                </Select>
            </div>
            <div>
                <Label htmlFor="category">Category</Label>
                <Select
                    id="category"
                    value={params.category}
                    onChange={(e) => apply({ category: e.target.value })}
                >
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
                <button type="submit" className={buttonClasses('secondary')}>
                    Search
                </button>
                {hasActiveBankFilters(params) ? (
                    <Link
                        href={bankListHref(params, {
                            q: '',
                            type: '',
                            category: '',
                            reconciliation: '',
                            period: '',
                            from: '',
                            to: '',
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
