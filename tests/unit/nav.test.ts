import { describe, expect, it } from "vitest";
import { can, type Role } from "@/lib/roles";
import {
  HELP_NAV_ITEM,
  NAV_GROUPS,
  SETTINGS_PAGES,
  flattenNavItems,
  filterNavGroups,
  hiddenNavGroups,
  optionalNavItems,
  visibleSettingsPages,
} from "@/components/dashboard/nav";
import { MENU_FEATURES } from "@/lib/menu/features";

const forRole = (role: Role) => (p: Parameters<typeof can>[1]) => can(role, p);

const CORE_LABELS = [
  "Overview",
  "Transactions",
  "Expenses",
  "Clients",
  "Invoices",
  "Reports",
  "Deadlines",
  "Settings",
];

describe("flattenNavItems", () => {
  it("returns all items across groups in order", () => {
    const flat = flattenNavItems(NAV_GROUPS);
    expect(flat).toHaveLength(22);
    expect(flat[0]?.label).toBe("Overview");
    expect(flat[flat.length - 1]?.label).toBe("Settings");
    expect(flat.map((item) => item.href)).toContain("/deadlines");
    expect(flat.map((item) => item.href)).not.toContain(HELP_NAV_ITEM.href);
  });

  it("keeps admin pages on the Settings hub, not the sidebar", () => {
    const hrefs = flattenNavItems(NAV_GROUPS).map((item) => item.href);
    for (const href of ["/company", "/users", "/audit", "/inbound-email", "/settings/billing"]) {
      expect(hrefs).not.toContain(href);
      expect(SETTINGS_PAGES.map((p) => p.href)).toContain(href);
    }
  });

  it("gives every optional feature exactly one menu item", () => {
    const features = flattenNavItems(NAV_GROUPS).flatMap((i) => (i.feature ? [i.feature] : []));
    expect([...features].sort()).toEqual([...MENU_FEATURES].sort());
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
  it("shows every item when no menu choice has been made", () => {
    for (const role of ["admin", "user", "accountant"] as const) {
      const groups = filterNavGroups(NAV_GROUPS, { permissionCheck: forRole(role) });
      expect(flattenNavItems(groups)).toHaveLength(22);
    }
  });

  it("drops limited-company items for sole traders", () => {
    const groups = filterNavGroups(NAV_GROUPS, {
      permissionCheck: forRole("admin"),
      entityType: "sole_trader",
    });
    const labels = flattenNavItems(groups).map((i) => i.label);
    expect(labels).toHaveLength(17);
    expect(labels).not.toContain("Dividends");
    expect(groups.map((g) => g.id)).not.toContain("payingYourself");
  });

  it("shows only core items when every optional item is off", () => {
    const groups = filterNavGroups(NAV_GROUPS, {
      permissionCheck: forRole("admin"),
      entityType: "limited_company",
      enabledFeatures: [],
    });
    expect(flattenNavItems(groups).map((i) => i.label)).toEqual(CORE_LABELS);
  });

  it("shows enabled optional items in menu order", () => {
    const groups = filterNavGroups(NAV_GROUPS, {
      permissionCheck: forRole("user"),
      enabledFeatures: ["recurring", "quotes"],
    });
    const sales = groups.find((g) => g.id === "sales");
    expect(sales?.items.map((i) => i.label)).toEqual([
      "Clients",
      "Quotes",
      "Invoices",
      "Recurring",
    ]);
  });

  it("drops empty groups after filtering", () => {
    expect(filterNavGroups(NAV_GROUPS, { permissionCheck: () => false })).toHaveLength(0);
  });
});

describe("hiddenNavGroups", () => {
  it("lists items the person can open but has hidden", () => {
    const hidden = flattenNavItems(
      hiddenNavGroups(NAV_GROUPS, {
        permissionCheck: forRole("admin"),
        entityType: "sole_trader",
        enabledFeatures: ["quotes", "orders"],
      }),
    ).map((i) => i.label);
    expect(hidden).toContain("Recurring");
    expect(hidden).not.toContain("Quotes");
    // Not applicable to sole traders, so not "hidden" either.
    expect(hidden).not.toContain("Dividends");
    expect(hidden).not.toContain("Invoices");
  });

  it("is empty when everything shows", () => {
    expect(
      hiddenNavGroups(NAV_GROUPS, { permissionCheck: forRole("admin"), enabledFeatures: null }),
    ).toHaveLength(0);
  });
});

describe("optionalNavItems", () => {
  it("lists every optional item available to the role and entity", () => {
    expect(
      optionalNavItems(NAV_GROUPS, { permissionCheck: forRole("admin") }),
    ).toHaveLength(MENU_FEATURES.length);
    expect(
      optionalNavItems(NAV_GROUPS, {
        permissionCheck: forRole("admin"),
        entityType: "sole_trader",
      }).map((i) => i.feature),
    ).not.toContain("dividends");
  });
});

describe("visibleSettingsPages", () => {
  const hrefs = (role: Role) => visibleSettingsPages(forRole(role)).map((p) => p.href);

  it("shows admins Business settings instead of the read-only Company profile", () => {
    expect(hrefs("admin")).toContain("/settings/business");
    expect(hrefs("admin")).not.toContain("/company");
  });

  it("shows co-founders and accountants the read-only Company profile", () => {
    for (const role of ["user", "accountant"] as const) {
      expect(hrefs(role)).toContain("/company");
      expect(hrefs(role)).not.toContain("/settings/business");
      expect(hrefs(role)).not.toContain("/users");
    }
  });
});
