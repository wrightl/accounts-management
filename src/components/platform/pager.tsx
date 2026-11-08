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

/** "Clear" link shown next to filter forms once any filter is active. */
export function ClearFilters({ path, active }: { path: string; active: boolean }) {
  if (!active) return null;
  return (
    <Link href={path} className="self-center text-sm text-navy hover:underline">
      Clear
    </Link>
  );
}
