const STORAGE_KEY = "alfa_bank_list_position";

/** Where the user was on the transactions page when they left to add an expense. */
export interface BankListPosition {
  /** The list URL, which carries filters, sort, page and page size. */
  href: string;
  scrollTop: number;
  /** Pages loaded so far in the infinite cards feed; 1 in the table view. */
  cardsPage: number;
}

/** Only ever return to the transactions list, whatever the query string says. */
export function bankReturnHref(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw === "/transactions" || raw.startsWith("/transactions?") ? raw : null;
}

export function bankListUrl(pathname: string, search: string): string {
  return search ? `${pathname}?${search}` : pathname;
}

export function saveBankListPosition(position: BankListPosition): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(position));
  } catch {
    // Storage can be blocked; the list then opens at the top.
  }
}

/** The saved position for this list URL, removed so it only applies once. */
export function takeBankListPosition(href: string): BankListPosition | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<BankListPosition>;
    if (saved.href !== href) return null;
    sessionStorage.removeItem(STORAGE_KEY);
    return {
      href,
      scrollTop: Number(saved.scrollTop) || 0,
      cardsPage: Math.max(1, Math.trunc(Number(saved.cardsPage)) || 1),
    };
  } catch {
    return null;
  }
}
