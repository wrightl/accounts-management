/** Page size the app asks for when it doesn't say. */
export const MOBILE_PAGE_DEFAULT = 50;
export const MOBILE_PAGE_MAX = 100;

export type MobilePage = { limit: number; offset: number };

function intParam(value: string | null, fallback: number): number {
  const n = value == null ? NaN : Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** `limit` (1–100, default 50) and `offset` (0 or more) from a query string. */
export function parseMobilePage(params: URLSearchParams): MobilePage {
  const limit = Math.min(
    Math.max(intParam(params.get("limit"), MOBILE_PAGE_DEFAULT), 1),
    MOBILE_PAGE_MAX,
  );
  const offset = Math.max(intParam(params.get("offset"), 0), 0);
  return { limit, offset };
}

/**
 * Fetch one row more than the page so the app knows whether to ask for more,
 * without a separate count.
 */
export function pageProbe(page: MobilePage): MobilePage {
  return { limit: page.limit + 1, offset: page.offset };
}

export function pageResult<T>(rows: T[], page: MobilePage): { items: T[]; hasMore: boolean } {
  return { items: rows.slice(0, page.limit), hasMore: rows.length > page.limit };
}
