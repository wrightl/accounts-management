import { describe, expect, it } from "vitest";
import { can } from "@/lib/roles";
import {
  HELP_NAV_ITEM,
  NAV_GROUPS,
  flattenNavItems,
  filterNavGroups,
} from "@/components/dashboard/nav";

describe("flattenNavItems", () => {
  it("returns all items across groups in order", () => {
    const flat = flattenNavItems(NAV_GROUPS);
    expect(flat).toHaveLength(17);
    expect(flat[0]?.label).toBe("Overview");
    expect(flat[flat.length - 1]?.label).toBe("Users");
    expect(flat.map((item) => item.href)).not.toContain(HELP_NAV_ITEM.href);
  });

  it("keeps overview at /dashboard and other pages at /[page]", () => {
    const [overview, ...rest] = flattenNavItems(NAV_GROUPS);
    expect(overview?.href).toBe("/dashboard");
    for (const item of rest) {
      expect(item.href.startsWith("/dashboard")).toBe(false);
      expect(item.href.startsWith("/")).toBe(true);
    }
  });
});

describe("filterNavGroups", () => {
  it("removes administration group for co-founder role", () => {
    const groups = filterNavGroups(NAV_GROUPS, (p) => can("user", p));
    const labels = groups.map((g) => g.label).filter(Boolean);
    expect(labels).not.toContain("Administration");
    expect(flattenNavItems(groups)).toHaveLength(13);
  });

  it("removes administration group for accountant role", () => {
    const groups = filterNavGroups(NAV_GROUPS, (p) => can("accountant", p));
    const labels = groups.map((g) => g.label).filter(Boolean);
    expect(labels).not.toContain("Administration");
    expect(flattenNavItems(groups)).toHaveLength(13);
  });

  it("includes administration group for admin role", () => {
    const groups = filterNavGroups(NAV_GROUPS, (p) => can("admin", p));
    const labels = groups.map((g) => g.label).filter(Boolean);
    expect(labels).toContain("Administration");
    expect(flattenNavItems(groups)).toHaveLength(17);
  });

  it("drops empty groups after filtering", () => {
    const groups = filterNavGroups(NAV_GROUPS, () => false);
    expect(groups).toHaveLength(0);
  });

  it("preserves group structure for visible items", () => {
    const groups = filterNavGroups(NAV_GROUPS, (p) => can("user", p));
    const sales = groups.find((g) => g.id === "sales");
    expect(sales?.items.map((i) => i.label)).toEqual([
      "Clients",
      "Quotes",
      "Orders",
      "Invoices",
      "Recurring",
    ]);
  });
});
