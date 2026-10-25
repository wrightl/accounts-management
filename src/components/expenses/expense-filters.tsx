"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { PeriodRangeSelect } from "@/components/period/bank-period-range-select";
import { buttonClasses } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/form";
import {
  EXPENSE_STATUS_FILTER_OPTIONS,
  expenseListDocumentCookie,
  expenseListHref,
  hasActiveExpenseFilters,
  type ExpenseListParams,
} from "@/lib/expenses/list-params";
import { cn } from "@/lib/utils";

/**
 * Expense filters driven entirely by the URL: each dropdown navigates as soon
 * as it changes, like the transactions filters. The current view is also
 * remembered so "← Expenses" on an expense returns to it.
 */
export function ExpenseFilters({
  params,
  categories,
  founders,
}: {
  params: ExpenseListParams;
  categories: readonly string[];
  founders: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const currentHref = expenseListHref(params);

  useEffect(() => {
    document.cookie = expenseListDocumentCookie(currentHref);
  }, [currentHref]);

  const apply = (overrides: Partial<ExpenseListParams>) => {
    startTransition(() => {
      router.push(expenseListHref(params, overrides), { scroll: false });
    });
  };

  // A remembered category that's no longer managed (e.g. from an import) stays selectable.
  const categoryOptions =
    params.category && !categories.includes(params.category)
      ? [...categories, params.category]
      : categories;

  return (
    <form
      role="search"
      aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault();
        const q = new FormData(e.currentTarget).get("q");
        apply({ q: typeof q === "string" ? q.trim().slice(0, 200) : "" });
      }}
      className={cn(
        "grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-2 lg:grid-cols-6",
        pending && "opacity-70",
      )}
    >
      <div className="sm:col-span-2">
        <Label htmlFor="q">Search</Label>
        {/* Keyed on the URL value so Clear and back/forward reset the box. */}
        <Input
          key={params.q}
          id="q"
          name="q"
          type="search"
          placeholder="Description or client…"
          defaultValue={params.q}
        />
      </div>
      <div>
        <PeriodRangeSelect value={params} onSelect={(range) => apply(range)} />
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
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="status">Status</Label>
        <Select
          id="status"
          value={params.mine ? "reimbursable" : params.status}
          disabled={params.mine}
          aria-describedby={params.mine ? "expense-mine-hint" : undefined}
          onChange={(e) =>
            apply({ status: e.target.value as ExpenseListParams["status"] })
          }
        >
          <option value="">All</option>
          {EXPENSE_STATUS_FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="billable">Rebillable</Label>
        <Select
          id="billable"
          value={params.billable}
          onChange={(e) =>
            apply({ billable: e.target.value as ExpenseListParams["billable"] })
          }
        >
          <option value="">All</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </Select>
      </div>
      {params.mine ? null : (
        <div>
          <Label htmlFor="paidBy">Paid by</Label>
          <Select
            id="paidBy"
            value={params.paidBy}
            onChange={(e) => apply({ paidBy: e.target.value })}
          >
            <option value="">Anyone</option>
            {founders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </Select>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-3 sm:col-span-2 lg:col-span-6">
        <button type="submit" className={buttonClasses("secondary")}>
          Search
        </button>
        {hasActiveExpenseFilters(params) ? (
          <Link
            href={expenseListHref(params, {
              q: "",
              period: "",
              from: "",
              to: "",
              category: "",
              status: "",
              paidBy: "",
              billable: "",
            })}
            scroll={false}
            className="text-sm text-muted hover:text-foreground hover:underline"
          >
            Clear filters
          </Link>
        ) : null}
        {params.mine ? (
          <span id="expense-mine-hint" className="text-sm text-muted">
            Showing your reimbursable expenses — status and payer are fixed.
          </span>
        ) : null}
      </div>
    </form>
  );
}
