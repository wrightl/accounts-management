import { describe, it, expect } from "vitest";
import {
  hasActiveInvoiceFilters,
  invoiceListHref,
  parseInvoiceListParams,
} from "@/lib/invoices/list-params";

const CLIENT = "0b5c3a7e-2f4d-4c1a-9e8b-1d2c3b4a5f60";

describe("parseInvoiceListParams", () => {
  it("applies defaults", () => {
    expect(parseInvoiceListParams({})).toEqual({
      q: "",
      status: "",
      client: "",
      period: "",
      from: "",
      to: "",
      page: 1,
      pageSize: 25,
      sort: "created",
      dir: "desc",
    });
  });

  it("accepts known filters and rejects invalid values", () => {
    const params = parseInvoiceListParams({
      q: " acme ",
      status: "overdue",
      client: CLIENT,
      period: "custom",
      from: "2026-04-01",
      to: "not-a-date",
      page: "3",
      pageSize: "50",
      sort: "total",
    });
    expect(params).toMatchObject({
      q: "acme",
      status: "overdue",
      client: CLIENT,
      period: "custom",
      from: "2026-04-01",
      to: "",
      page: 3,
      pageSize: 50,
      sort: "total",
      dir: "desc",
    });

    const bad = parseInvoiceListParams({
      status: "pending",
      client: "not-a-uuid",
      page: "-4",
      pageSize: "7",
      sort: "nope",
    });
    expect(bad).toMatchObject({ status: "", client: "", page: 1, pageSize: 25, sort: "created" });
  });

  it("treats bare from/to as a custom period", () => {
    expect(parseInvoiceListParams({ from: "2026-01-01" })).toMatchObject({
      period: "custom",
      from: "2026-01-01",
    });
  });

  it("drops dates on a preset period", () => {
    expect(
      parseInvoiceListParams({ period: "current-month", from: "2026-01-01" }),
    ).toMatchObject({ from: "", to: "" });
  });
});

describe("invoiceListHref", () => {
  it("omits defaults", () => {
    expect(invoiceListHref(parseInvoiceListParams({}))).toBe("/invoices");
  });

  // A column's natural direction (asc for number) isn't written out.
  it("keeps filters, paging and sort", () => {
    const params = parseInvoiceListParams({
      q: "acme",
      status: "paid",
      client: CLIENT,
      page: "2",
      pageSize: "100",
      sort: "number",
      dir: "asc",
    });
    const href = invoiceListHref(params);
    const qs = new URLSearchParams(href.split("?")[1]);
    expect(Object.fromEntries(qs)).toEqual({
      q: "acme",
      status: "paid",
      client: CLIENT,
      page: "2",
      pageSize: "100",
      sort: "number",
    });
  });

  it("applies overrides", () => {
    const params = parseInvoiceListParams({ q: "acme", page: "4" });
    expect(invoiceListHref(params, { page: 1 })).toBe("/invoices?q=acme");
  });
});

describe("hasActiveInvoiceFilters", () => {
  it("ignores sort and paging", () => {
    expect(
      hasActiveInvoiceFilters(parseInvoiceListParams({ page: "2", pageSize: "50", sort: "total" })),
    ).toBe(false);
  });

  it("counts each filter", () => {
    for (const sp of [{ q: "x" }, { status: "draft" }, { client: CLIENT }, { period: "current-month" }]) {
      expect(hasActiveInvoiceFilters(parseInvoiceListParams(sp))).toBe(true);
    }
  });
});
