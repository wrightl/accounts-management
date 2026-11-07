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
import {
  LIST_PAGE_SIZE,
  parseListPage,
  parseListPageSize,
  type ListPageSize,
} from "@/lib/list-paging";
import type { InvoiceStatus } from "@/lib/invoices/status";

/** "created" is the default order (newest first) and has no header. */
export const INVOICE_SORT = defineTableSort({
  columns: ["created", "number", "client", "order", "status", "issued", "due", "total"],
  fallback: { sort: "created", dir: "desc" },
  descFirst: ["created", "issued", "total"],
});
export type InvoiceSortColumn = (typeof INVOICE_SORT.columns)[number];

export const INVOICE_STATUS_FILTER_OPTIONS: { value: InvoiceStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "overdue", label: "Overdue" },
  { value: "paid", label: "Paid" },
  { value: "void", label: "Void" },
];

export interface InvoiceListParams {
  q: string;
  status: InvoiceStatus | "";
  client: string;
  /** Period on the issue date. */
  period: PeriodPreset | "";
  from: string;
  to: string;
  page: number;
  pageSize: ListPageSize;
  sort: InvoiceSortColumn;
  dir: SortDir;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function first(sp: Record<string, string | string[] | undefined>, key: string): string {
  const value = sp[key];
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() ?? "";
}

export function parseInvoiceListParams(
  sp: Record<string, string | string[] | undefined>,
): InvoiceListParams {
  const statusRaw = first(sp, "status");
  const status = INVOICE_STATUS_FILTER_OPTIONS.some((o) => o.value === statusRaw)
    ? (statusRaw as InvoiceStatus)
    : "";
  const clientRaw = first(sp, "client");
  const from = parseIsoDate(first(sp, "from")) ?? "";
  const to = parseIsoDate(first(sp, "to")) ?? "";
  const periodRaw = first(sp, "period");
  let period: PeriodPreset | "" = isPeriodPreset(periodRaw) ? periodRaw : "";
  if (!period && (from || to)) period = "custom";
  return {
    q: first(sp, "q").slice(0, 200),
    status,
    client: UUID.test(clientRaw) ? clientRaw : "",
    period,
    from: period === "custom" ? from : "",
    to: period === "custom" ? to : "",
    page: parseListPage(first(sp, "page")),
    pageSize: parseListPageSize(first(sp, "pageSize")),
    ...parseTableSort(sp, INVOICE_SORT),
  };
}

/** Filters that narrow the list; sort and paging don't count. */
export function hasActiveInvoiceFilters(params: InvoiceListParams): boolean {
  return Boolean(params.q || params.status || params.client || params.period);
}

export function resolveInvoiceListDateRange(
  params: InvoiceListParams,
  fyEndMonth: number,
): { from: string; to: string } {
  if (!params.period) return { from: "", to: "" };
  const resolved = resolvePeriod(params.period, fyEndMonth, {
    from: params.from,
    to: params.to,
  });
  return { from: resolved.from, to: resolved.to };
}

/** Build `/invoices?...`, omitting defaults so URLs stay short. */
export function invoiceListHref(
  params: InvoiceListParams,
  overrides: Partial<InvoiceListParams> = {},
): string {
  const s = invoiceListSearchParams(params, overrides).toString();
  return s ? `/invoices?${s}` : "/invoices";
}

export function invoiceListSearchParams(
  params: InvoiceListParams,
  overrides: Partial<InvoiceListParams> = {},
): URLSearchParams {
  const next = { ...params, ...overrides };
  const qs = new URLSearchParams();
  if (next.q) qs.set("q", next.q);
  if (next.status) qs.set("status", next.status);
  if (next.client) qs.set("client", next.client);
  if (next.period) {
    qs.set("period", next.period);
    if (next.period === "custom") {
      if (next.from) qs.set("from", next.from);
      if (next.to) qs.set("to", next.to);
    }
  }
  if (next.page > 1) qs.set("page", String(next.page));
  if (next.pageSize !== LIST_PAGE_SIZE) qs.set("pageSize", String(next.pageSize));
  setTableSortParams(qs, INVOICE_SORT, { sort: next.sort, dir: next.dir });
  return qs;
}
