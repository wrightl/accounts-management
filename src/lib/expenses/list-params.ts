import {
  isPeriodPreset,
  parseIsoDate,
  resolvePeriod,
  type PeriodPreset,
} from "@/lib/dates";
import { parseTableSort, setTableSortParams, type SortDir } from "@/lib/table-sort";
import type { ExpenseStatus } from "@/lib/expenses/categories";
import { EXPENSE_SORT, type ExpenseSortColumn } from "@/lib/expenses/list-sort";

/**
 * Session cookie holding the last expenses list query, so "← Expenses" and the
 * redirects after delete/reject land back on the same filtered view.
 */
export const EXPENSE_LIST_COOKIE = "alfa_expenses_list";

export const EXPENSE_STATUS_FILTER_OPTIONS: { value: ExpenseStatus; label: string }[] = [
  { value: "pending", label: "Pending review" },
  { value: "recorded", label: "Recorded" },
  { value: "reimbursable", label: "Reimbursable" },
  { value: "reimbursed", label: "Reimbursed" },
  { value: "company_paid", label: "Company paid" },
];

export interface ExpenseListParams {
  q: string;
  period: PeriodPreset | "";
  from: string;
  to: string;
  category: string;
  status: ExpenseStatus | "";
  paidBy: string;
  billable: "true" | "false" | "";
  /** My reimbursable: overrides status and paidBy with the viewer's own. */
  mine: boolean;
  sort: ExpenseSortColumn;
  dir: SortDir;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function first(sp: Record<string, string | string[] | undefined>, key: string): string {
  const value = sp[key];
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() ?? "";
}

export function parseExpenseListParams(
  sp: Record<string, string | string[] | undefined>,
): ExpenseListParams {
  const statusRaw = first(sp, "status");
  const status = EXPENSE_STATUS_FILTER_OPTIONS.some((o) => o.value === statusRaw)
    ? (statusRaw as ExpenseStatus)
    : "";
  const billableRaw = first(sp, "billable");
  const paidByRaw = first(sp, "paidBy");
  const from = parseIsoDate(first(sp, "from")) ?? "";
  const to = parseIsoDate(first(sp, "to")) ?? "";
  const periodRaw = first(sp, "period");
  let period: PeriodPreset | "" = isPeriodPreset(periodRaw) ? periodRaw : "";
  // Older links carried bare from/to dates.
  if (!period && (from || to)) period = "custom";
  return {
    q: first(sp, "q").slice(0, 200),
    period,
    from: period === "custom" ? from : "",
    to: period === "custom" ? to : "",
    category: first(sp, "category").slice(0, 80),
    status,
    paidBy: UUID.test(paidByRaw) ? paidByRaw : "",
    billable: billableRaw === "true" || billableRaw === "false" ? billableRaw : "",
    mine: first(sp, "mine") === "1",
    ...parseTableSort(sp, EXPENSE_SORT),
  };
}

/** Filters that narrow the list; sort and the My reimbursable toggle don't count. */
export function hasActiveExpenseFilters(params: ExpenseListParams): boolean {
  return Boolean(
    params.q ||
      params.period ||
      params.category ||
      params.status ||
      params.paidBy ||
      params.billable,
  );
}

export function resolveExpenseListDateRange(
  params: ExpenseListParams,
  fyEndMonth: number,
): { from: string; to: string } {
  if (!params.period) return { from: "", to: "" };
  const resolved = resolvePeriod(params.period, fyEndMonth, {
    from: params.from,
    to: params.to,
  });
  return { from: resolved.from, to: resolved.to };
}

/** Build `/expenses?...`, omitting defaults so URLs stay short. */
export function expenseListHref(
  params: ExpenseListParams,
  overrides: Partial<ExpenseListParams> = {},
): string {
  const s = expenseListSearchParams(params, overrides).toString();
  return s ? `/expenses?${s}` : "/expenses";
}

export function expenseListSearchParams(
  params: ExpenseListParams,
  overrides: Partial<ExpenseListParams> = {},
): URLSearchParams {
  const next = { ...params, ...overrides };
  const qs = new URLSearchParams();
  if (next.mine) qs.set("mine", "1");
  if (next.q) qs.set("q", next.q);
  if (next.period) {
    qs.set("period", next.period);
    if (next.period === "custom") {
      if (next.from) qs.set("from", next.from);
      if (next.to) qs.set("to", next.to);
    }
  }
  if (next.category) qs.set("category", next.category);
  if (next.status) qs.set("status", next.status);
  if (next.paidBy) qs.set("paidBy", next.paidBy);
  if (next.billable) qs.set("billable", next.billable);
  setTableSortParams(qs, EXPENSE_SORT, { sort: next.sort, dir: next.dir });
  return qs;
}

/** The remembered list URL from the cookie, re-validated so it can only be an expenses list. */
export function expenseListReturnHref(cookieValue: string | undefined | null): string {
  if (!cookieValue) return "/expenses";
  // Next decodes cookie values; an encoded one still has its "=" as %3D.
  let query = cookieValue;
  if (!query.includes("=")) {
    try {
      query = decodeURIComponent(query);
    } catch {
      return "/expenses";
    }
  }
  return expenseListHref(
    parseExpenseListParams(Object.fromEntries(new URLSearchParams(query))),
  );
}

/** `document.cookie` assignment remembering `href`'s query for this browser session. */
export function expenseListDocumentCookie(href: string): string {
  const query = href.includes("?") ? href.slice(href.indexOf("?") + 1) : "";
  return `${EXPENSE_LIST_COOKIE}=${encodeURIComponent(query)}; Path=/; SameSite=Lax`;
}
