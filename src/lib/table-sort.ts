/**
 * URL-driven table sorting: `?sort=<column>&dir=asc|desc`. Each table declares
 * a config; unknown values fall back to its default so hand-edited URLs can't
 * break the page.
 */

export type SortDir = "asc" | "desc";

export type TableSort<K extends string> = { sort: K; dir: SortDir };

export type TableSortConfig<K extends string> = {
  columns: readonly K[];
  fallback: TableSort<K>;
  /** Columns whose first click sorts descending (dates, money); the rest start A–Z. */
  descFirst: readonly K[];
  /** Param prefix when a page has several sortable tables, e.g. "c" → csort/cdir. */
  prefix?: string;
};

export function defineTableSort<K extends string>(config: TableSortConfig<K>): TableSortConfig<K> {
  return config;
}

function paramNames(config: TableSortConfig<string>) {
  const prefix = config.prefix ?? "";
  return { sort: `${prefix}sort`, dir: `${prefix}dir` };
}

export function firstDir<K extends string>(config: TableSortConfig<K>, column: K): SortDir {
  return config.descFirst.includes(column) ? "desc" : "asc";
}

export function parseTableSort<K extends string>(
  sp: Record<string, string | string[] | undefined>,
  config: TableSortConfig<K>,
): TableSort<K> {
  const names = paramNames(config);
  const pick = (key: string) => {
    const value = sp[key];
    return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
  };
  const rawSort = pick(names.sort);
  const rawDir = pick(names.dir);
  const sort = (config.columns as readonly string[]).includes(rawSort)
    ? (rawSort as K)
    : config.fallback.sort;
  const dir: SortDir =
    rawDir === "asc" || rawDir === "desc"
      ? rawDir
      : sort === config.fallback.sort
        ? config.fallback.dir
        : firstDir(config, sort);
  return { sort, dir };
}

/** The sort a header click should apply: flip the active column, else start fresh. */
export function nextTableSort<K extends string>(
  config: TableSortConfig<K>,
  current: TableSort<K>,
  column: K,
): TableSort<K> {
  if (current.sort === column) {
    return { sort: column, dir: current.dir === "asc" ? "desc" : "asc" };
  }
  return { sort: column, dir: firstDir(config, column) };
}

/** Write sort params, leaving them out when they match the default. */
export function setTableSortParams<K extends string>(
  qs: URLSearchParams,
  config: TableSortConfig<K>,
  value: TableSort<K>,
): void {
  const names = paramNames(config);
  qs.delete(names.sort);
  qs.delete(names.dir);
  if (value.sort === config.fallback.sort && value.dir === config.fallback.dir) return;
  qs.set(names.sort, value.sort);
  const natural = value.sort === config.fallback.sort ? config.fallback.dir : firstDir(config, value.sort);
  if (value.dir !== natural) qs.set(names.dir, value.dir);
}

/** Header link for `column`: the current URL with only this table's sort changed. */
export function tableSortHref<K extends string>(
  path: string,
  sp: Record<string, string | string[] | undefined>,
  config: TableSortConfig<K>,
  current: TableSort<K>,
  column: K,
): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    for (const v of Array.isArray(value) ? value : value == null ? [] : [value]) qs.append(key, v);
  }
  setTableSortParams(qs, config, nextTableSort(config, current, column));
  const query = qs.toString();
  return query ? `${path}?${query}` : path;
}

export type SortValue = string | number | null | undefined;

/**
 * Sort already-loaded rows. Blanks go last in both directions; text compares
 * case-insensitively with numbers in order (INV-9 before INV-10); ties keep
 * the loaded order. A column without an accessor is the order rows arrived in,
 * taken as descending.
 */
export function sortRows<T, K extends string>(
  rows: readonly T[],
  sort: TableSort<K>,
  accessors: Partial<Record<K, (row: T) => SortValue>>,
): T[] {
  const get = accessors[sort.sort];
  if (!get) return sort.dir === "desc" ? [...rows] : [...rows].reverse();
  const sign = sort.dir === "asc" ? 1 : -1;
  const blank = (v: SortValue) => v == null || v === "";
  return rows
    .map((row, index) => ({ row, index, value: get(row) }))
    .sort((a, b) => {
      if (blank(a.value) || blank(b.value)) {
        return blank(a.value) === blank(b.value) ? a.index - b.index : blank(a.value) ? 1 : -1;
      }
      const cmp =
        typeof a.value === "number" && typeof b.value === "number"
          ? a.value - b.value
          : String(a.value).localeCompare(String(b.value), "en-GB", {
              sensitivity: "base",
              numeric: true,
            });
      return cmp * sign || a.index - b.index;
    })
    .map((entry) => entry.row);
}

/** Rank by a fixed list (e.g. workflow order of statuses); unknown values last. */
export function rankIn<V extends string>(order: readonly V[], value: string): number | null {
  const i = (order as readonly string[]).indexOf(value);
  return i === -1 ? null : i;
}
