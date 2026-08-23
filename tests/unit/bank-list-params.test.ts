import { describe, it, expect } from "vitest";
import {
  parseBankListParams,
  bankListHref,
  hasActiveBankFilters,
  groupByBookedAt,
  bankSearchPattern,
} from "@/lib/bank/list-params";

describe("parseBankListParams", () => {
  it("applies defaults", () => {
    expect(parseBankListParams({})).toEqual({
      q: "",
      type: "",
      category: "",
      period: "",
      from: "",
      to: "",
      page: 1,
      pageSize: 25,
      view: "table",
    });
  });

  it("accepts known filters and rejects invalid values", () => {
    const params = parseBankListParams({
      q: " acme ",
      type: "incoming",
      category: "TRAVEL",
      from: "2026-04-01",
      to: "not-a-date",
      page: "2",
      view: "cards",
    });
    expect(params.q).toBe("acme");
    expect(params.type).toBe("incoming");
    expect(params.category).toBe("TRAVEL");
    expect(params.from).toBe("2026-04-01");
    expect(params.to).toBe("");
    expect(params.period).toBe("custom");
    expect(params.page).toBe(2);
    expect(params.view).toBe("cards");
  });

  it("treats unknown type/view as defaults", () => {
    const params = parseBankListParams({ type: "both", view: "grid", page: "0" });
    expect(params.type).toBe("");
    expect(params.view).toBe("table");
    expect(params.page).toBe(1);
  });

  it("parses pageSize and rejects invalid values", () => {
    expect(parseBankListParams({ pageSize: "50" }).pageSize).toBe(50);
    expect(parseBankListParams({ pageSize: "100" }).pageSize).toBe(100);
    expect(parseBankListParams({ pageSize: "999" }).pageSize).toBe(25);
    expect(parseBankListParams({ pageSize: "abc" }).pageSize).toBe(25);
  });

  it("parses period presets and custom dates", () => {
    expect(parseBankListParams({ period: "last-month" }).period).toBe("last-month");
    expect(parseBankListParams({ period: "custom", from: "2026-01-01", to: "2026-01-31" })).toEqual(
      expect.objectContaining({
        period: "custom",
        from: "2026-01-01",
        to: "2026-01-31",
      }),
    );
    expect(parseBankListParams({ period: "nope" }).period).toBe("");
  });
});

describe("bankListHref", () => {
  it("omits default table view and page 1", () => {
    const base = parseBankListParams({ q: "starling", view: "table" });
    expect(bankListHref(base)).toBe("/dashboard/transactions?q=starling");
  });

  it("keeps cards view and later pages", () => {
    const base = parseBankListParams({ view: "cards", page: "3", type: "outgoing" });
    expect(bankListHref(base)).toBe("/dashboard/transactions?type=outgoing&page=3&view=cards");
  });

  it("includes non-default pageSize in href", () => {
    const base = parseBankListParams({ pageSize: "50", q: "acme" });
    expect(bankListHref(base)).toBe("/dashboard/transactions?q=acme&pageSize=50");
  });

  it("resets filters while keeping view", () => {
    const base = parseBankListParams({ q: "x", view: "cards", page: "4" });
    expect(
      bankListHref(base, { q: "", type: "", category: "", period: "", from: "", to: "", page: 1 }),
    ).toBe("/dashboard/transactions?view=cards");
  });

  it("includes period and custom dates in href", () => {
    const base = parseBankListParams({
      period: "custom",
      from: "2026-01-01",
      to: "2026-01-31",
      q: "acme",
    });
    expect(bankListHref(base)).toBe(
      "/dashboard/transactions?q=acme&period=custom&from=2026-01-01&to=2026-01-31",
    );
    expect(bankListHref(parseBankListParams({ period: "last-month" }))).toBe(
      "/dashboard/transactions?period=last-month",
    );
  });
});

describe("hasActiveBankFilters", () => {
  it("is false for defaults", () => {
    expect(hasActiveBankFilters(parseBankListParams({}))).toBe(false);
  });

  it("is true when a filter is set", () => {
    expect(hasActiveBankFilters(parseBankListParams({ type: "incoming" }))).toBe(true);
    expect(hasActiveBankFilters(parseBankListParams({ period: "last-month" }))).toBe(true);
  });
});

describe("groupByBookedAt", () => {
  it("groups consecutive rows with the same booked date", () => {
    const groups = groupByBookedAt(
      [
        { bookedAt: "2026-08-23", id: "a" },
        { bookedAt: "2026-08-23", id: "b" },
        { bookedAt: "2026-08-22", id: "c" },
      ],
      (iso) => iso,
    );
    expect(groups).toHaveLength(2);
    expect(groups[0].items.map((r) => r.id)).toEqual(["a", "b"]);
    expect(groups[1].date).toBe("2026-08-22");
  });
});

describe("bankSearchPattern", () => {
  it("wraps trimmed text and strips wildcards", () => {
    expect(bankSearchPattern("  acme%_  ")).toBe("%acme%");
    expect(bankSearchPattern("   ")).toBeNull();
  });
});
