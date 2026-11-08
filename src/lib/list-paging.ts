/** Page sizes shared by every paged list. */
export const LIST_PAGE_SIZE = 25;

export const LIST_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export type ListPageSize = (typeof LIST_PAGE_SIZE_OPTIONS)[number];

export function parseListPageSize(raw: string): ListPageSize {
  const n = Math.trunc(Number(raw));
  if (n === 50 || n === 100) return n;
  return LIST_PAGE_SIZE;
}

export function parseListPage(raw: string): number {
  return Math.max(1, Math.trunc(Number(raw)) || 1);
}

export type ListPaging = { page: number; pageSize: ListPageSize };

/** One page of a list, as every paged query returns it. */
export type Paged<T> = {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

type SearchParams = Record<string, string | string[] | undefined>;

/** `page` / `pageSize`, or e.g. `inboundPage` / `inboundPageSize` when a page has several tables. */
export function listPagingParamNames(prefix = ""): { page: string; pageSize: string } {
  return prefix
    ? { page: `${prefix}Page`, pageSize: `${prefix}PageSize` }
    : { page: "page", pageSize: "pageSize" };
}

function first(sp: SearchParams, key: string): string {
  const value = sp[key];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export function parseListPaging(sp: SearchParams, prefix = ""): ListPaging {
  const names = listPagingParamNames(prefix);
  return {
    page: parseListPage(first(sp, names.page)),
    pageSize: parseListPageSize(first(sp, names.pageSize)),
  };
}

/** Write paging params, leaving out page 1 and the default size so URLs stay short. */
export function setListPagingParams(
  qs: URLSearchParams,
  paging: { page: number; pageSize?: number },
  prefix = "",
): void {
  const names = listPagingParamNames(prefix);
  qs.delete(names.page);
  qs.delete(names.pageSize);
  if (paging.page > 1) qs.set(names.page, String(paging.page));
  if (paging.pageSize && paging.pageSize !== LIST_PAGE_SIZE) {
    qs.set(names.pageSize, String(paging.pageSize));
  }
}

/** The page to show once the total is known: past the end clamps to the last page. */
export function pageWindow(
  total: number,
  page: number,
  pageSize: number,
): { page: number; pageCount: number; offset: number } {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const clamped = Math.min(Math.max(1, Math.trunc(page) || 1), pageCount);
  return { page: clamped, pageCount, offset: (clamped - 1) * pageSize };
}

/**
 * The current URL with this list's page (and optionally page size) changed,
 * keeping filters, sort and any other table's paging.
 */
export function listPageHref(
  path: string,
  sp: SearchParams,
  to: { page: number; pageSize?: number },
  prefix = "",
): string {
  const names = listPagingParamNames(prefix);
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    for (const v of Array.isArray(value) ? value : value == null ? [] : [value]) qs.append(key, v);
  }
  const pageSize = to.pageSize ?? parseListPageSize(first(sp, names.pageSize));
  setListPagingParams(qs, { page: to.page, pageSize }, prefix);
  const query = qs.toString();
  return query ? `${path}?${query}` : path;
}

/**
 * Count, clamp the page to the last one, then fetch it. The row query must use
 * the same WHERE as the count and end its ORDER BY on a unique column, so no
 * row repeats or goes missing between pages.
 */
export async function fetchPage<T>(
  paging: { page?: number; pageSize?: number },
  count: () => Promise<number>,
  rows: (window: { limit: number; offset: number }) => Promise<T[]>,
): Promise<Paged<T>> {
  const pageSize = paging.pageSize ?? LIST_PAGE_SIZE;
  const total = await count();
  const { page, pageCount, offset } = pageWindow(total, paging.page ?? 1, pageSize);
  return { rows: await rows({ limit: pageSize, offset }), total, page, pageSize, pageCount };
}
