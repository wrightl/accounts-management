"use client";

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { loadBankTransactionsPage } from "@/actions/bank";
import { Button } from "@/components/ui/button";
import { BankTransactionCardList } from "@/components/bank/bank-list";
import {
  BankFeedDepthContext,
  scrollBankListTo,
  useBankListUrl,
} from "@/components/bank/bank-list-position";
import { takeBankListPosition } from "@/lib/bank/list-position";
import { BANK_PAGE_SIZE } from "@/lib/bank/list-params";
import type { BankListParams } from "@/lib/bank/list-params";
import type { BankTransactionListItem } from "@/lib/bank/queries";
import type { RowLabel } from "@/lib/labels/queries";

export function BankCardsFeed({
  initialRows,
  initialPage,
  pageCount,
  total,
  filters,
  customCategories,
  incomeCategories,
  allLabels,
  canWrite,
  canRaiseQuery = false,
  showAccount = false,
}: {
  initialRows: BankTransactionListItem[];
  initialPage: number;
  pageCount: number;
  total: number;
  filters: Pick<BankListParams, "q" | "type" | "category" | "reconciliation" | "labels" | "from" | "to">;
  customCategories: readonly string[];
  incomeCategories: readonly string[];
  allLabels: readonly RowLabel[];
  canWrite: boolean;
  canRaiseQuery?: boolean;
  showAccount?: boolean;
}) {
  const [rows, setRows] = useState(initialRows);
  const [page, setPage] = useState(initialPage);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const listUrl = useBankListUrl();
  /** Returning from a new expense: the depth to load back to and the scroll to apply. */
  const restoreRef = useRef<{ page: number; scrollTop: number } | null>(null);
  const scrollAfterReloadRef = useRef<number | null>(null);
  const reloadIdRef = useRef(0);
  /** A refresh only returns the first page, so deeper pages are fetched again. */
  const [refreshThrough, setRefreshThrough] = useState<number | null>(null);

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
    filters.labels.join() !== prevFilters.labels.join() ||
    filters.from !== prevFilters.from ||
    filters.to !== prevFilters.to
  ) {
    setPrevInitialRows(initialRows);
    setPrevInitialPage(initialPage);
    setPrevFilters(filters);
    setError(null);
    const sameList =
      initialPage === prevInitialPage &&
      filters.q === prevFilters.q &&
      filters.type === prevFilters.type &&
      filters.category === prevFilters.category &&
      filters.reconciliation === prevFilters.reconciliation &&
      filters.labels.join() === prevFilters.labels.join() &&
      filters.from === prevFilters.from &&
      filters.to === prevFilters.to;
    if (sameList && page > initialPage) {
      setRefreshThrough(page);
    } else {
      setRefreshThrough(null);
      setRows(initialRows);
      setPage(initialPage);
    }
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

  const reloadThrough = useEffectEvent((target: number) => {
    const reloadId = ++reloadIdRef.current;
    loadingRef.current = true;
    startTransition(async () => {
      const next = [...initialRows];
      const seen = new Set(next.map((r) => r.id));
      let reached = initialPage;
      for (let p = initialPage + 1; p <= Math.min(target, pageCount); p++) {
        const result = await loadBankTransactionsPage({
          ...filters,
          page: p,
          pageSize: BANK_PAGE_SIZE,
        });
        if (reloadId !== reloadIdRef.current) return;
        if (!result.ok) {
          setError(result.error);
          break;
        }
        for (const row of result.result.rows) {
          if (!seen.has(row.id)) {
            seen.add(row.id);
            next.push(row);
          }
        }
        reached = result.result.page;
      }
      loadingRef.current = false;
      scrollAfterReloadRef.current = restoreRef.current?.scrollTop ?? null;
      restoreRef.current = null;
      setRows(next);
      setPage(reached);
      setRefreshThrough(null);
    });
  });

  // Runs before the page's restorer, so the scroll waits for the rows it needs.
  useLayoutEffect(() => {
    const position = takeBankListPosition(listUrl);
    if (!position) return;
    if (position.cardsPage > 1) {
      restoreRef.current = { page: position.cardsPage, scrollTop: position.scrollTop };
      loadingRef.current = true;
    } else {
      scrollBankListTo(position.scrollTop);
    }
  }, [listUrl]);

  useEffect(() => {
    reloadIdRef.current++;
    loadingRef.current = false;
    const target = restoreRef.current?.page ?? refreshThrough;
    if (target != null) reloadThrough(target);
  }, [initialRows, refreshThrough]);

  useLayoutEffect(() => {
    if (scrollAfterReloadRef.current == null) return;
    scrollBankListTo(scrollAfterReloadRef.current);
    scrollAfterReloadRef.current = null;
  }, [rows]);

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
      <BankFeedDepthContext.Provider value={page}>
        <BankTransactionCardList
          rows={rows}
          customCategories={customCategories}
          incomeCategories={incomeCategories}
          allLabels={allLabels}
          canWrite={canWrite}
          canRaiseQuery={canRaiseQuery}
          showAccount={showAccount}
        />
      </BankFeedDepthContext.Provider>

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
