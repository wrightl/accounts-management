import { describe, expect, it } from "vitest";
import {
  defineTableSort,
  nextTableSort,
  parseTableSort,
  rankIn,
  setTableSortParams,
  sortRows,
  tableSortHref,
} from "@/lib/table-sort";

const CONFIG = defineTableSort({
  columns: ["date", "name", "amount"],
  fallback: { sort: "date", dir: "desc" },
  descFirst: ["date", "amount"],
});

describe("parseTableSort", () => {
  it("falls back to the default for missing or unknown values", () => {
    expect(parseTableSort({}, CONFIG)).toEqual(CONFIG.fallback);
    expect(parseTableSort({ sort: "drop table", dir: "sideways" }, CONFIG)).toEqual(CONFIG.fallback);
  });

  it("uses each column's first direction when dir is left out", () => {
    expect(parseTableSort({ sort: "name" }, CONFIG)).toEqual({ sort: "name", dir: "asc" });
    expect(parseTableSort({ sort: "amount" }, CONFIG)).toEqual({ sort: "amount", dir: "desc" });
    expect(parseTableSort({ sort: ["name", "date"], dir: "desc" }, CONFIG)).toEqual({
      sort: "name",
      dir: "desc",
    });
  });

  it("reads prefixed params so two tables on a page sort independently", () => {
    const clients = defineTableSort({ ...CONFIG, prefix: "c" });
    const sp = { sort: "name", csort: "amount", cdir: "asc" };
    expect(parseTableSort(sp, CONFIG)).toEqual({ sort: "name", dir: "asc" });
    expect(parseTableSort(sp, clients)).toEqual({ sort: "amount", dir: "asc" });
  });
});

describe("nextTableSort", () => {
  it("flips the active column and starts a new one in its first direction", () => {
    expect(nextTableSort(CONFIG, { sort: "date", dir: "desc" }, "date")).toEqual({ sort: "date", dir: "asc" });
    expect(nextTableSort(CONFIG, { sort: "date", dir: "asc" }, "name")).toEqual({ sort: "name", dir: "asc" });
    expect(nextTableSort(CONFIG, { sort: "name", dir: "asc" }, "amount")).toEqual({ sort: "amount", dir: "desc" });
  });
});

describe("setTableSortParams", () => {
  it("round-trips through parseTableSort with short URLs", () => {
    for (const value of [
      { sort: "date", dir: "desc" },
      { sort: "date", dir: "asc" },
      { sort: "name", dir: "asc" },
      { sort: "name", dir: "desc" },
    ] as const) {
      const qs = new URLSearchParams("q=x&sort=old&dir=asc");
      setTableSortParams(qs, CONFIG, value);
      expect(parseTableSort(Object.fromEntries(qs), CONFIG)).toEqual(value);
    }
    const qs = new URLSearchParams("sort=name");
    setTableSortParams(qs, CONFIG, CONFIG.fallback);
    expect(qs.toString()).toBe("");
  });
});

describe("tableSortHref", () => {
  it("keeps other params and only changes this table's sort", () => {
    const clients = defineTableSort({ ...CONFIG, prefix: "c" });
    const sp = { period: "all", sort: "name" };
    expect(tableSortHref("/p", sp, clients, CONFIG.fallback, "amount")).toBe(
      "/p?period=all&sort=name&csort=amount",
    );
    expect(tableSortHref("/p", { sort: "name" }, CONFIG, { sort: "name", dir: "asc" }, "date")).toBe("/p");
  });
});

describe("sortRows", () => {
  const rows = [
    { n: "INV-10", total: 500, client: "beta" },
    { n: "INV-9", total: null, client: "Acme" },
    { n: "INV-2", total: 500, client: "" },
    { n: "INV-11", total: 100, client: "acme" },
  ];
  const by = (sort: "n" | "total" | "client" | "created", dir: "asc" | "desc") =>
    sortRows(rows, { sort, dir }, {
      n: (r) => r.n,
      total: (r) => r.total,
      client: (r) => r.client,
    }).map((r) => r.n);

  it("orders numbers inside text naturally", () => {
    expect(by("n", "asc")).toEqual(["INV-2", "INV-9", "INV-10", "INV-11"]);
  });

  it("keeps blanks last both ways and ties in loaded order", () => {
    expect(by("total", "desc")).toEqual(["INV-10", "INV-2", "INV-11", "INV-9"]);
    expect(by("total", "asc")).toEqual(["INV-11", "INV-10", "INV-2", "INV-9"]);
    expect(by("client", "asc")).toEqual(["INV-9", "INV-11", "INV-10", "INV-2"]);
  });

  it("treats a column without an accessor as the loaded order", () => {
    expect(by("created", "desc")).toEqual(["INV-10", "INV-9", "INV-2", "INV-11"]);
    expect(by("created", "asc")).toEqual(["INV-11", "INV-2", "INV-9", "INV-10"]);
  });
});

describe("rankIn", () => {
  it("ranks by a fixed order with unknowns blank", () => {
    expect(rankIn(["draft", "sent"], "sent")).toBe(1);
    expect(rankIn(["draft", "sent"], "nope")).toBeNull();
  });
});
