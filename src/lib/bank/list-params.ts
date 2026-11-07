import {
  isPeriodPreset,
  parseIsoDate,
  resolvePeriod,
  type PeriodPreset,
} from "@/lib/dates";
import {
  defineTableSort,
  parseTableSort,
  setTableSortParams,
  type SortDir,
} from "@/lib/table-sort";
import { parseLabelIds } from "@/lib/labels/params";
import {
  LIST_PAGE_SIZE,
  LIST_PAGE_SIZE_OPTIONS,
  parseListPage,
  parseListPageSize,
  type ListPageSize,
} from "@/lib/list-paging";

export const BANK_PAGE_SIZE = LIST_PAGE_SIZE;

export const BANK_PAGE_SIZE_OPTIONS = LIST_PAGE_SIZE_OPTIONS;
export type BankPageSize = ListPageSize;

export type BankTxType = "incoming" | "outgoing";
export type BankReconciliationFilter = "reconciled" | "unreconciled";
export type BankView = "table" | "cards";

export const BANK_SORT = defineTableSort({
  columns: ["date", "counterparty", "reference", "category", "amount"],
  fallback: { sort: "date", dir: "desc" },
  descFirst: ["date", "amount"],
});
export type BankSortColumn = (typeof BANK_SORT.columns)[number];

export interface BankListParams {
  q: string;
  type: BankTxType | "";
  category: string;
  reconciliation: BankReconciliationFilter | "";
  /** Label ids; a transaction matches if it has any of them. */
  labels: string[];
  period: PeriodPreset | "";
  from: string;
  to: string;
  page: number;
  pageSize: BankPageSize;
  view: BankView;
  /** Table view only; cards are grouped by day so always run newest first. */
  sort: BankSortColumn;
  dir: SortDir;
}

export const parseBankPageSize = parseListPageSize;

function first(sp: Record<string, string | string[] | undefined>, key: string): string {
  const value = sp[key];
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() ?? "";
}

export function parseBankListParams(
  sp: Record<string, string | string[] | undefined>,
): BankListParams {
  const typeRaw = first(sp, "type");
  const type: BankTxType | "" =
    typeRaw === "incoming" || typeRaw === "outgoing" ? typeRaw : "";
  const reconciliationRaw = first(sp, "reconciliation");
  const reconciliation: BankReconciliationFilter | "" =
    reconciliationRaw === "reconciled" || reconciliationRaw === "unreconciled"
      ? reconciliationRaw
      : "";
  const viewRaw = first(sp, "view");
  const page = parseListPage(first(sp, "page"));
  const periodRaw = first(sp, "period");
  const from = first(sp, "from");
  const to = first(sp, "to");
  const parsedFrom = parseIsoDate(from) ?? "";
  const parsedTo = parseIsoDate(to) ?? "";
  let period: PeriodPreset | "" = isPeriodPreset(periodRaw) ? periodRaw : "";
  if (!period && (parsedFrom || parsedTo)) {
    period = "custom";
  }
  return {
    q: first(sp, "q").slice(0, 200),
    type,
    category: first(sp, "category").slice(0, 80),
    reconciliation,
    labels: parseLabelIds(sp.labels),
    period,
    from: parsedFrom,
    to: parsedTo,
    page,
    pageSize: parseBankPageSize(first(sp, "pageSize")),
    view: viewRaw === "cards" ? "cards" : "table",
    ...parseTableSort(sp, BANK_SORT),
  };
}

export function hasActiveBankFilters(params: BankListParams): boolean {
  return Boolean(
    params.q ||
      params.type ||
      params.category ||
      params.reconciliation ||
      params.labels.length > 0 ||
      params.period,
  );
}

export function resolveBankListDateRange(
  params: BankListParams,
  fyEndMonth: number,
): { from: string; to: string } {
  if (!params.period) return { from: "", to: "" };
  const resolved = resolvePeriod(params.period, fyEndMonth, {
    from: params.from,
    to: params.to,
  });
  return { from: resolved.from, to: resolved.to };
}

/** Build `/transactions?...`, omitting defaults so URLs stay short. */
export function bankListHref(
  params: BankListParams,
  overrides: Partial<BankListParams> = {},
): string {
  const next = { ...params, ...overrides };
  const qs = new URLSearchParams();
  if (next.q) qs.set("q", next.q);
  if (next.type) qs.set("type", next.type);
  if (next.category) qs.set("category", next.category);
  if (next.reconciliation) qs.set("reconciliation", next.reconciliation);
  if (next.labels.length > 0) qs.set("labels", next.labels.join(","));
  if (next.period) {
    qs.set("period", next.period);
    if (next.period === "custom") {
      if (next.from) qs.set("from", next.from);
      if (next.to) qs.set("to", next.to);
    }
  }
  if (next.page > 1) qs.set("page", String(next.page));
  if (next.pageSize !== BANK_PAGE_SIZE) qs.set("pageSize", String(next.pageSize));
  if (next.view !== "table") qs.set("view", next.view);
  setTableSortParams(qs, BANK_SORT, { sort: next.sort, dir: next.dir });
  const s = qs.toString();
  return s ? `/transactions?${s}` : "/transactions";
}

export function groupByBookedAt<T extends { bookedAt: string }>(
  rows: T[],
  labelFor: (iso: string) => string,
): { date: string; label: string; items: T[] }[] {
  const groups: { date: string; label: string; items: T[] }[] = [];
  for (const row of rows) {
    const last = groups.at(-1);
    if (last && last.date === row.bookedAt) {
      last.items.push(row);
    } else {
      groups.push({
        date: row.bookedAt,
        label: labelFor(row.bookedAt),
        items: [row],
      });
    }
  }
  return groups;
}

/** Strip LIKE wildcards so user search is taken literally. */
export function bankSearchPattern(q: string): string | null {
  const trimmed = q.trim().replace(/[%_]/g, "");
  if (!trimmed) return null;
  return `%${trimmed}%`;
}
