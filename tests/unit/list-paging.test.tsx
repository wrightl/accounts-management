/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ListPagination } from "@/components/ui/list-pagination";
import { expenseListHref, parseExpenseListParams } from "@/lib/expenses/list-params";
import {
  fetchPage,
  listPageHref,
  pageWindow,
  parseListPaging,
  setListPagingParams,
} from "@/lib/list-paging";
import { defineTableSort, tableSortHref } from "@/lib/table-sort";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(cleanup);

describe("parseListPaging", () => {
  it("reads page and size, falling back to page 1 of 25", () => {
    expect(parseListPaging({ page: "3", pageSize: "50" })).toEqual({ page: 3, pageSize: 50 });
    expect(parseListPaging({ page: "-2", pageSize: "37" })).toEqual({ page: 1, pageSize: 25 });
    expect(parseListPaging({})).toEqual({ page: 1, pageSize: 25 });
  });

  it("reads a second table's paging from prefixed params", () => {
    const sp = { page: "2", sendPage: "4", sendPageSize: "100" };
    expect(parseListPaging(sp, "send")).toEqual({ page: 4, pageSize: 100 });
    expect(parseListPaging(sp, "inbound")).toEqual({ page: 1, pageSize: 25 });
  });
});

describe("paging URLs", () => {
  it("leaves out page 1 and the default size", () => {
    const qs = new URLSearchParams("q=x&page=4&pageSize=50");
    setListPagingParams(qs, { page: 1, pageSize: 25 });
    expect(qs.toString()).toBe("q=x");
  });

  it("changes only this table's page, keeping filters, sort and the other table", () => {
    const sp = { status: "failed", sort: "total", inboundPage: "3", pageSize: "50" };
    expect(listPageHref("/x", sp, { page: 2 })).toBe(
      "/x?status=failed&sort=total&inboundPage=3&page=2&pageSize=50",
    );
    expect(listPageHref("/x", sp, { page: 1 }, "inbound")).toBe(
      "/x?status=failed&sort=total&pageSize=50",
    );
    expect(listPageHref("/x", {}, { page: 1, pageSize: 100 })).toBe("/x?pageSize=100");
  });

  it("goes back to the first page when the sort changes", () => {
    const sort = defineTableSort({
      columns: ["name", "total"],
      fallback: { sort: "name", dir: "asc" },
      descFirst: ["total"],
    });
    expect(
      tableSortHref("/x", { page: "3", pageSize: "50" }, sort, { sort: "name", dir: "asc" }, "total"),
    ).toBe("/x?pageSize=50&sort=total");
  });

  it("keeps the expenses page for the same view, and resets it for a new filter", () => {
    const params = parseExpenseListParams({ status: "recorded", page: "3" });
    expect(expenseListHref(params)).toBe("/expenses?status=recorded&page=3");
    expect(expenseListHref(params, { page: 4 })).toBe("/expenses?status=recorded&page=4");
    expect(expenseListHref(params, { status: "pending" })).toBe("/expenses?status=pending");
  });
});

describe("pageWindow", () => {
  it("clamps a page past the end to the last page", () => {
    expect(pageWindow(51, 9, 25)).toEqual({ page: 3, pageCount: 3, offset: 50 });
    expect(pageWindow(0, 2, 25)).toEqual({ page: 1, pageCount: 1, offset: 0 });
  });
});

describe("fetchPage", () => {
  it("fetches the clamped page's window", async () => {
    const rows = vi.fn(async ({ limit, offset }: { limit: number; offset: number }) =>
      Array.from({ length: Math.min(limit, 60 - offset) }, (_, i) => offset + i),
    );
    const page = await fetchPage({ page: 7, pageSize: 25 }, async () => 60, rows);
    expect(rows).toHaveBeenCalledWith({ limit: 25, offset: 50 });
    expect(page).toMatchObject({ total: 60, page: 3, pageSize: 25, pageCount: 3 });
    expect(page.rows).toHaveLength(10);
  });
});

describe("ListPagination", () => {
  const href = ({ page, pageSize }: { page: number; pageSize?: number }) =>
    `/x?page=${page}${pageSize ? `&pageSize=${pageSize}` : ""}`;

  it("stays out of the way when everything fits on one page", () => {
    const { container } = render(
      <ListPagination total={25} page={1} pageSize={25} pageCount={1} href={href} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("shows the range and links to the other pages", () => {
    render(<ListPagination total={60} page={2} pageSize={25} pageCount={3} href={href} />);
    expect(screen.getByText("Showing 26–50 of 60")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Next" }).getAttribute("href")).toBe("/x?page=3");
    expect(screen.getByRole("link", { name: "First" }).getAttribute("href")).toBe("/x?page=1");
  });

  it("still offers the page size when a larger size fits everything", () => {
    render(<ListPagination total={30} page={1} pageSize={50} pageCount={1} href={href} />);
    expect(screen.getByText("Rows per page")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Next" })).toBeNull();
  });
});
