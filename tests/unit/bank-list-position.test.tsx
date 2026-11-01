// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { loadBankTransactionsPage } from "@/actions/bank";
import { BankCardsFeed } from "@/components/bank/bank-cards-feed";
import {
  BankListPositionRestorer,
  NewExpenseFromBankListLink,
} from "@/components/bank/bank-list-position";
import { bankListHref, parseBankListParams } from "@/lib/bank/list-params";
import {
  bankReturnHref,
  saveBankListPosition,
  takeBankListPosition,
} from "@/lib/bank/list-position";
import type { BankTransactionListItem } from "@/lib/bank/queries";

let search = "";
vi.mock("next/navigation", () => ({
  usePathname: () => "/transactions",
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/actions/bank", () => ({ loadBankTransactionsPage: vi.fn() }));
vi.mock("@/components/bank/bank-list", () => ({
  BankTransactionCardList: ({ rows }: { rows: { id: string }[] }) => (
    <ul>
      {rows.map((r) => (
        <li key={r.id}>{r.id}</li>
      ))}
    </ul>
  ),
}));

const loadMock = vi.mocked(loadBankTransactionsPage);
const row = (id: string) => ({ id }) as BankTransactionListItem;
const filters = { q: "", type: "", category: "", reconciliation: "", from: "", to: "" } as const;

function pageResult(page: number) {
  return {
    ok: true as const,
    result: { rows: [row(`p${page}`)], page, pageSize: 25, total: 75, pageCount: 3 },
  };
}

function Feed({ rows = [row("p1")] }: { rows?: BankTransactionListItem[] }) {
  return (
    <BankCardsFeed
      initialRows={rows}
      initialPage={1}
      pageCount={3}
      total={75}
      filters={filters}
      customCategories={[]}
      incomeCategories={[]}
      canWrite
    />
  );
}

function mainElement() {
  const main = document.createElement("main");
  main.id = "main-content";
  document.body.append(main);
  return main;
}

beforeEach(() => {
  search = "";
  sessionStorage.clear();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  loadMock.mockImplementation(async ({ page }) => pageResult(page));
});

afterEach(() => {
  cleanup();
  document.getElementById("main-content")?.remove();
  loadMock.mockReset();
  vi.unstubAllGlobals();
});

describe("bankReturnHref", () => {
  it("accepts the transactions list only", () => {
    expect(bankReturnHref("/transactions")).toBe("/transactions");
    expect(bankReturnHref("/transactions?page=2")).toBe("/transactions?page=2");
    expect(bankReturnHref("https://evil.example")).toBeNull();
    expect(bankReturnHref("//evil.example/transactions")).toBeNull();
    expect(bankReturnHref("/transactions.evil")).toBeNull();
    expect(bankReturnHref("/expenses")).toBeNull();
    expect(bankReturnHref(undefined)).toBeNull();
  });
});

describe("saved position", () => {
  it("applies once, and only to the same list URL", () => {
    saveBankListPosition({ href: "/transactions?page=2", scrollTop: 40, cardsPage: 1 });
    expect(takeBankListPosition("/transactions?page=3")).toBeNull();
    expect(takeBankListPosition("/transactions?page=2")?.scrollTop).toBe(40);
    expect(takeBankListPosition("/transactions?page=2")).toBeNull();
  });
});

describe("leaving and returning to the list", () => {
  it("carries filters, sort, direction, page and page size in the return link", () => {
    const list = bankListHref(
      parseBankListParams({
        q: "adobe",
        reconciliation: "unreconciled",
        sort: "amount",
        dir: "asc",
        page: "3",
        pageSize: "50",
      }),
    );
    search = list.split("?")[1]!;
    render(
      <NewExpenseFromBankListLink params={{ bankTransactionId: "tx1" }}>
        Create
      </NewExpenseFromBankListLink>,
    );
    const href = new URL(screen.getByText("Create").getAttribute("href")!, "http://x");
    expect(href.pathname).toBe("/expenses/new");
    expect(href.searchParams.get("bankTransactionId")).toBe("tx1");
    const back = new URLSearchParams(href.searchParams.get("returnTo")!.split("?")[1]);
    expect(Object.fromEntries(back)).toMatchObject({
      q: "adobe",
      reconciliation: "unreconciled",
      sort: "amount",
      dir: "asc",
      page: "3",
      pageSize: "50",
    });
  });

  it("restores the scroll position of the table view", () => {
    const main = mainElement();
    search = "page=2";
    saveBankListPosition({ href: "/transactions?page=2", scrollTop: 640, cardsPage: 1 });
    render(<BankListPositionRestorer />);
    expect(main.scrollTop).toBe(640);
  });

  it("loads the cards feed back to its depth before scrolling", async () => {
    const main = mainElement();
    search = "view=cards";
    saveBankListPosition({ href: "/transactions?view=cards", scrollTop: 900, cardsPage: 3 });
    render(
      <>
        <Feed />
        <BankListPositionRestorer />
      </>,
    );
    expect(main.scrollTop).toBe(0);
    await screen.findByText("p3");
    expect(screen.getByText("p2")).toBeTruthy();
    await waitFor(() => expect(main.scrollTop).toBe(900));
  });

  it("keeps the feed's depth when a link refreshes the list", async () => {
    search = "view=cards";
    saveBankListPosition({ href: "/transactions?view=cards", scrollTop: 0, cardsPage: 2 });
    const { rerender } = render(<Feed />);
    await screen.findByText("p2");
    loadMock.mockClear();
    rerender(<Feed rows={[row("p1")]} />);
    await waitFor(() => expect(loadMock).toHaveBeenCalledTimes(1));
    expect(loadMock.mock.calls[0]![0].page).toBe(2);
    expect(await screen.findByText("p2")).toBeTruthy();
  });
});
