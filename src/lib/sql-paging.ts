import "server-only";
import { sql, type AnyColumn, type SQL } from "drizzle-orm";
import type { SortDir } from "@/lib/table-sort";

/** ORDER BY one expression with blanks last in both directions, like the on-screen sorts. */
export function sortExpr(dir: SortDir) {
  return (expr: SQL | AnyColumn) =>
    dir === "asc" ? sql`${expr} asc nulls last` : sql`${expr} desc nulls last`;
}

/** Case-insensitive text, with empty strings treated as blank. */
export function sortText(expr: SQL | AnyColumn): SQL {
  return sql`nullif(lower(${expr}), '')`;
}

/** Prefix then trailing digits as a number, so INV-9 sorts before INV-10. */
export function sortNumbered(dir: SortDir, expr: SQL | AnyColumn): SQL[] {
  const by = sortExpr(dir);
  return [
    by(sql`lower(regexp_replace(${expr}, '[0-9]+$', ''))`),
    by(sql`substring(${expr} from '([0-9]+)$')::numeric`),
    by(sql`lower(${expr})`),
  ];
}

/** Rank by a fixed list (e.g. workflow order of statuses); unknown values last. */
export function sortRank(expr: SQL | AnyColumn, order: readonly string[]): SQL {
  const cases = order.map((value, i) => sql`when ${value} then ${sql.raw(String(i))}`);
  return sql`case ${expr} ${sql.join(cases, sql` `)} end`;
}
