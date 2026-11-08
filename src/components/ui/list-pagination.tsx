import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { PageSizeSelect } from "@/components/ui/page-size-select";
import { LIST_PAGE_SIZE, LIST_PAGE_SIZE_OPTIONS } from "@/lib/list-paging";
import { cn } from "@/lib/utils";

/**
 * "Showing 1–25 of 80", rows per page and First / Previous / Next / Last for
 * a server-paged list. `href` builds the list URL for a page and page size;
 * `listPageHref` does that for lists without their own URL builder. Hidden
 * when everything fits on one page at the smallest size.
 */
export function ListPagination({
  total,
  page,
  pageSize,
  pageCount,
  href,
}: {
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  href: (to: { page: number; pageSize?: number }) => string;
}) {
  if (total <= LIST_PAGE_SIZE && page === 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const hasPrev = page > 1;
  const hasNext = page < pageCount;
  const sizeHrefs = Object.fromEntries(
    LIST_PAGE_SIZE_OPTIONS.map((size) => [size, href({ page: 1, pageSize: size })]),
  );

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
      <div className="flex flex-wrap items-center gap-4">
        <p>
          Showing {from}–{to} of {total}
        </p>
        <PageSizeSelect pageSize={pageSize} hrefs={sizeHrefs} />
      </div>
      <div className="flex items-center gap-2">
        <PageLink href={hasPrev ? href({ page: 1 }) : null}>First</PageLink>
        <PageLink href={hasPrev ? href({ page: page - 1 }) : null}>Previous</PageLink>
        <span>
          Page {page} of {pageCount}
        </span>
        <PageLink href={hasNext ? href({ page: page + 1 }) : null}>Next</PageLink>
        <PageLink href={hasNext ? href({ page: pageCount }) : null}>Last</PageLink>
      </div>
    </div>
  );
}

/** A pager button, shown dimmed when there's no page to go to. */
function PageLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  if (href) {
    return (
      <Link href={href} className={buttonClasses("ghost")}>
        {children}
      </Link>
    );
  }
  return (
    <span className={cn(buttonClasses("ghost"), "pointer-events-none opacity-40")}>
      {children}
    </span>
  );
}
