/** Page sizes shared by the paged list pages (transactions, invoices). */
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
