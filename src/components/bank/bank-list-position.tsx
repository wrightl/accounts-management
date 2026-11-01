"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { createContext, useContext, useLayoutEffect, type ReactNode } from "react";
import {
  bankListUrl,
  saveBankListPosition,
  takeBankListPosition,
} from "@/lib/bank/list-position";

/** Pages loaded in the cards feed, so a return can load the same rows again. */
export const BankFeedDepthContext = createContext(1);

export function useBankListUrl(): string {
  return bankListUrl(usePathname(), useSearchParams().toString());
}

/** The page scrolls inside `<main>`, so the browser does not restore it. */
export function scrollBankListTo(top: number) {
  const main = document.getElementById("main-content");
  if (main) main.scrollTop = top;
}

/** A new-expense URL that returns here on save, and a call to remember this spot. */
export function useNewExpenseFromBankList() {
  const href = useBankListUrl();
  const cardsPage = useContext(BankFeedDepthContext);
  return {
    newExpenseHref: (params: Record<string, string>) =>
      `/expenses/new?${new URLSearchParams({ ...params, returnTo: href })}`,
    rememberPosition: () =>
      saveBankListPosition({
        href,
        scrollTop: document.getElementById("main-content")?.scrollTop ?? 0,
        cardsPage,
      }),
  };
}

export function NewExpenseFromBankListLink({
  params,
  className,
  children,
}: {
  params: Record<string, string>;
  className?: string;
  children: ReactNode;
}) {
  const { newExpenseHref, rememberPosition } = useNewExpenseFromBankList();
  return (
    <Link href={newExpenseHref(params)} className={className} onClick={rememberPosition}>
      {children}
    </Link>
  );
}

/**
 * Puts the list back where it was. Render it after the list: a cards feed with
 * more pages to load takes the position first and scrolls once they are in.
 */
export function BankListPositionRestorer() {
  const href = useBankListUrl();
  useLayoutEffect(() => {
    const position = takeBankListPosition(href);
    if (position) scrollBankListTo(position.scrollTop);
  }, [href]);
  return null;
}
