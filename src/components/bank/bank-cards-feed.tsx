"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { loadBankTransactionsPage } from "@/actions/bank";
import { Button } from "@/components/ui/button";
import { BankTransactionCardList } from "@/components/bank/bank-list";
import { BANK_PAGE_SIZE } from "@/lib/bank/list-params";
import type { BankListParams } from "@/lib/bank/list-params";
import type { BankTransactionListItem } from "@/lib/bank/queries";

export function BankCardsFeed({
  initialRows,
  initialPage,
  pageCount,
  total,
  filters,
  customCategories,
  canWrite,
}: {
  initialRows: BankTransactionListItem[];
  initialPage: number;
  pageCount: number;
  total: number;
  filters: Pick<BankListParams, "q" | "type" | "category" | "reconciliation" | "from" | "to">;
  customCategories: readonly string[];
  canWrite: boolean;
}) {
  const [rows, setRows] = useState(initialRows);
  const [page, setPage] = useState(initialPage);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  const [prevInitialRows, setPrevInitialRows] = useState(initialRows);
  const [prevInitialPage, setPrevInitialPage] = useState(initialPage);
  const [prevFilters, setPrevFilters] = useState(filters);
  if (
    initialRows !== prevInitialRows ||
    initialPage !== prevInitialPage ||
    filters.q !== prevFilters.q ||
    filters.type !== prevFilters.type ||
    filters.category !== prevFilters.category ||
    filters.reconciliation !== prevFilters.reconciliation ||
    filters.from !== prevFilters.from ||
    filters.to !== prevFilters.to
  ) {
    setPrevInitialRows(initialRows);
    setPrevInitialPage(initialPage);
    setPrevFilters(filters);
    setRows(initialRows);
    setPage(initialPage);
    setError(null);
  }

  const hasMore = page < pageCount;

  const loadMore = useCallback(() => {
    if (!hasMore || loadingRef.current || pending) return;
    loadingRef.current = true;
    setError(null);

    startTransition(async () => {
      const nextPage = page + 1;
      const result = await loadBankTransactionsPage({
        ...filters,
        page: nextPage,
        pageSize: BANK_PAGE_SIZE,
      });

      loadingRef.current = false;

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setRows((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        const appended = result.result.rows.filter((r) => !seen.has(r.id));
        return [...prev, ...appended];
      });
      setPage(result.result.page);
    });
  }, [filters, hasMore, page, pending]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { rootMargin: "200px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  return (
    <div>
      <BankTransactionCardList
        rows={rows}
        customCategories={customCategories}
        canWrite={canWrite}
      />

      {hasMore ? (
        <div ref={sentinelRef} className="mt-6 flex flex-col items-center gap-2">
          <Button type="button" variant="secondary" disabled={pending} onClick={loadMore}>
            {pending ? "Loading…" : "Load more"}
          </Button>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
      ) : rows.length > 0 ? (
        <p className="mt-6 text-center text-sm text-muted">
          Showing all {total} transaction{total === 1 ? "" : "s"}
        </p>
      ) : null}
    </div>
  );
}
