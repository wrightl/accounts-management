import { describe, it, expect } from "vitest";
import {
  expenseListDocumentCookie,
  expenseListHref,
  expenseListReturnHref,
  hasActiveExpenseFilters,
  parseExpenseListParams,
} from "@/lib/expenses/list-params";

const PAYER = "0b6f3c1e-8a52-4d0e-9a3b-2f1c4e5d6a7b";

describe("parseExpenseListParams", () => {
  it("applies defaults", () => {
    expect(parseExpenseListParams({})).toEqual({
      q: "",
      period: "",
      from: "",
      to: "",
      category: "",
      status: "",
      paidBy: "",
      billable: "",
      mine: false,
      sort: "date",
      dir: "desc",
    });
  });

  it("drops values the query can't use", () => {
    const params = parseExpenseListParams({
      status: "bogus",
      paidBy: "not-a-uuid",
      billable: "maybe",
      from: "2026-02-31",
      period: "next-year",
    });
    expect(params).toMatchObject({ status: "", paidBy: "", billable: "", from: "", period: "" });
  });

  it("treats bare from/to dates from older links as a custom range", () => {
    expect(parseExpenseListParams({ from: "2026-01-01", to: "2026-03-31" })).toMatchObject({
      period: "custom",
      from: "2026-01-01",
      to: "2026-03-31",
    });
  });

  it("ignores from/to on a preset period", () => {
    expect(
      parseExpenseListParams({ period: "last-month", from: "2026-01-01" }),
    ).toMatchObject({ period: "last-month", from: "" });
  });
});

describe("expenseListHref", () => {
  it("round-trips every filter and the sort", () => {
    const href =
      `/expenses?mine=1&q=train&period=custom&from=2026-01-01&to=2026-01-31` +
      `&category=Travel&status=pending&paidBy=${PAYER}&billable=true&sort=amount&dir=asc`;
    const params = parseExpenseListParams(
      Object.fromEntries(new URL(href, "http://localhost").searchParams),
    );
    expect(expenseListHref(params)).toBe(href);
  });

  it("is the bare path with nothing set", () => {
    expect(expenseListHref(parseExpenseListParams({}))).toBe("/expenses");
  });
});

describe("hasActiveExpenseFilters", () => {
  it("ignores sort and the My reimbursable toggle", () => {
    expect(hasActiveExpenseFilters(parseExpenseListParams({ mine: "1", sort: "amount" }))).toBe(false);
    expect(hasActiveExpenseFilters(parseExpenseListParams({ billable: "false" }))).toBe(true);
  });
});

describe("remembered list", () => {
  const cookieValue = (href: string) =>
    expenseListDocumentCookie(href).split(";")[0].split("=").slice(1).join("=");

  it("returns to the remembered view, whether or not the cookie was decoded", () => {
    const href = "/expenses?q=50%25+off&category=Travel";
    const raw = cookieValue(href);
    expect(expenseListReturnHref(raw)).toBe(href);
    expect(expenseListReturnHref(decodeURIComponent(raw))).toBe(href);
  });

  it("falls back to the plain list", () => {
    expect(expenseListReturnHref(undefined)).toBe("/expenses");
    expect(expenseListReturnHref("%E0%A4%A")).toBe("/expenses");
  });

  it("only ever builds an expenses list URL", () => {
    expect(expenseListReturnHref("//evil.example/?status=pending")).toBe("/expenses");
  });
});
