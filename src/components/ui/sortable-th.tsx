import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { TH } from "@/components/ui/table";
import {
  tableSortHref,
  type SortDir,
  type TableSort,
  type TableSortConfig,
} from "@/lib/table-sort";
import { cn } from "@/lib/utils";

/** Column header that links to the same list sorted by this column. */
export function SortableTH({
  label,
  href,
  active,
  dir,
  align = "start",
  className,
}: {
  label: string;
  /** List URL with this column's next sort applied. */
  href: string;
  active: boolean;
  dir: SortDir;
  align?: "start" | "end";
  className?: string;
}) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TH
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn(align === "end" && "text-right", className)}
    >
      <Link
        href={href}
        scroll={false}
        className={cn(
          "inline-flex items-center gap-1 uppercase hover:text-foreground",
          align === "end" && "flex-row-reverse",
          active && "text-foreground",
        )}
      >
        {label}
        <Icon className={cn("h-3.5 w-3.5", !active && "opacity-40")} aria-hidden />
        {active ? (
          <span className="sr-only">
            , sorted {dir === "asc" ? "ascending" : "descending"}
          </span>
        ) : null}
      </Link>
    </TH>
  );
}

/**
 * Header factory for one table: `const th = sortHeaders(...)` then
 * `{th("Total", "total", "end")}`. Links keep every other URL param.
 */
export function sortHeaders<K extends string>(
  path: string,
  sp: Record<string, string | string[] | undefined>,
  config: TableSortConfig<K>,
  sort: TableSort<K>,
) {
  function header(label: string, column: K, align?: "start" | "end") {
    return (
      <SortableTH
        key={column}
        label={label}
        href={tableSortHref(path, sp, config, sort, column)}
        active={sort.sort === column}
        dir={sort.dir}
        align={align}
      />
    );
  }
  return header;
}
