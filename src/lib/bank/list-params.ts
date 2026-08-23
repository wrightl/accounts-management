import {
  isPeriodPreset,
  parseIsoDate,
  resolvePeriod,
  type PeriodPreset,
} from "@/lib/dates";

export const BANK_PAGE_SIZE = 25;

export const BANK_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export type BankPageSize = (typeof BANK_PAGE_SIZE_OPTIONS)[number];

export type BankTxType = "incoming" | "outgoing";
export type BankReconciliationFilter = "reconciled" | "unreconciled";
export type BankView = "table" | "cards";

export interface BankListParams {
  q: string;
  type: BankTxType | "";
  category: string;
  reconciliation: BankReconciliationFilter | "";
  period: PeriodPreset | "";
  from: string;
  to: string;
  page: number;
  pageSize: BankPageSize;
  view: BankView;
}

export function parseBankPageSize(raw: string): BankPageSize {
  const n = Math.trunc(Number(raw));
  if (n === 50 || n === 100) return n;
  return BANK_PAGE_SIZE;
}

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
  const page = Math.max(1, Math.trunc(Number(first(sp, "page")) || 1));
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
    period,
    from: parsedFrom,
    to: parsedTo,
    page,
    pageSize: parseBankPageSize(first(sp, "pageSize")),
    view: viewRaw === "cards" ? "cards" : "table",
  };
}

export function hasActiveBankFilters(params: BankListParams): boolean {
  return Boolean(params.q || params.type || params.category || params.reconciliation || params.period);
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

/** Build `/dashboard/transactions?...`, omitting defaults so URLs stay short. */
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
  const s = qs.toString();
  return s ? `/dashboard/transactions?${s}` : "/dashboard/transactions";
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
