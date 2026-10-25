import Link from "next/link";

/** Build a URL keeping the current filters, dropping empty values. */
export function platformHref(
  path: string,
  params: Record<string, string | number | undefined | null>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "" && value !== 0) {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

/** First / previous / next / last links for offset-paginated tables. */
export function Pager({
  path,
  params,
  offset,
  pageSize,
  shown,
  total,
  offsetKey = "offset",
  firstLabel = "« First",
  newerLabel = "← Previous",
  olderLabel = "Next →",
  lastLabel = "Last »",
}: {
  path: string;
  params: Record<string, string | undefined>;
  offset: number;
  pageSize: number;
  /** Rows on this page. */
  shown: number;
  /** Rows across all pages. */
  total: number;
  offsetKey?: string;
  firstLabel?: string;
  newerLabel?: string;
  olderLabel?: string;
  lastLabel?: string;
}) {
  const hasMore = offset + shown < total;
  if (offset === 0 && !hasMore) return null;
  const href = (to: number) => platformHref(path, { ...params, [offsetKey]: to });
  const lastOffset = Math.max(0, Math.floor((total - 1) / pageSize) * pageSize);
  return (
    <div className="mt-4 flex items-center gap-4 text-sm">
      {offset > 0 ? (
        <>
          <Link href={href(0)} className="text-navy hover:underline">
            {firstLabel}
          </Link>
          <Link
            href={href(Math.max(0, offset - pageSize))}
            className="text-navy hover:underline"
          >
            {newerLabel}
          </Link>
        </>
      ) : null}
      <span className="text-muted">
        Showing {shown === 0 ? 0 : offset + 1}–{offset + shown} of {total}
      </span>
      {hasMore ? (
        <>
          <Link href={href(offset + pageSize)} className="text-navy hover:underline">
            {olderLabel}
          </Link>
          <Link href={href(lastOffset)} className="text-navy hover:underline">
            {lastLabel}
          </Link>
        </>
      ) : null}
    </div>
  );
}

/** "Clear" link shown next to filter forms once any filter is active. */
export function ClearFilters({ path, active }: { path: string; active: boolean }) {
  if (!active) return null;
  return (
    <Link href={path} className="self-center text-sm text-navy hover:underline">
      Clear
    </Link>
  );
}

/** Parse a non-negative integer offset from a search param. */
export function parseOffset(value: string | undefined): number {
  return Math.max(0, Math.floor(Number(value ?? 0)) || 0);
}
