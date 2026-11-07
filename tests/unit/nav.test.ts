import { describe, expect, it } from "vitest";
import { can, type Role } from "@/lib/roles";
import {
  HELP_NAV_ITEM,
  NAV_GROUPS,
  SETTINGS_PAGES,
  flattenNavItems,
  filterNavGroups,
  hiddenNavGroups,
  aiOnlyFeatures,
  optionalNavItems,
  visibleSettingsPages,
} from "@/components/dashboard/nav";
import { MENU_FEATURES } from "@/lib/menu/features";

const forRole = (role: Role) => (p: Parameters<typeof can>[1]) => can(role, p);

const CORE_LABELS = [
  "Overview",
  "Queries",
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
    expect(flat).toHaveLength(23);
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
    for (const role of ["admin", "user"] as const) {
      const groups = filterNavGroups(NAV_GROUPS, {
        permissionCheck: forRole(role),
        aiAvailable: true,
      });
      expect(flattenNavItems(groups)).toHaveLength(23);
    }
  });

  it("shows accountants the filing pages and what the pack contains", () => {
    const groups = filterNavGroups(NAV_GROUPS, {
      permissionCheck: forRole("accountant"),
      aiAvailable: true,
      entityType: "limited_company",
    });
    expect(flattenNavItems(groups).map((i) => i.href).sort()).toEqual([
      "/deadlines",
      "/directors-loans",
      "/dividends",
      "/expenses",
      "/invoices",
      "/queries",
      "/recurring-invoices",
      "/reimbursements",
      "/reports",
      "/reserves",
      "/settings",
      "/shareholders",
      "/transactions",
    ]);
  });

  it("only tells people who run the company they are paying themselves", () => {
    const labelFor = (role: "admin" | "user" | "accountant") =>
      filterNavGroups(NAV_GROUPS, {
        permissionCheck: forRole(role),
        aiAvailable: true,
        entityType: "limited_company",
      }).find((g) => g.id === "payingYourself")?.label;
    expect(labelFor("admin")).toBe("Paying yourself");
    expect(labelFor("user")).toBe("Paying yourself");
    expect(labelFor("accountant")).toBe("Directors & shareholders");
  });

  it("drops limited-company items for sole traders", () => {
    const groups = filterNavGroups(NAV_GROUPS, {
      permissionCheck: forRole("admin"),
      aiAvailable: true,
      entityType: "sole_trader",
    });
    const labels = flattenNavItems(groups).map((i) => i.label);
    expect(labels).toHaveLength(18);
    expect(labels).not.toContain("Dividends");
    expect(groups.map((g) => g.id)).not.toContain("payingYourself");
  });

  it("shows only core items when every optional item is off", () => {
    const groups = filterNavGroups(NAV_GROUPS, {
      permissionCheck: forRole("admin"),
      aiAvailable: true,
      entityType: "limited_company",
      enabledFeatures: [],
    });
    expect(flattenNavItems(groups).map((i) => i.label)).toEqual(CORE_LABELS);
  });

  it("shows enabled optional items in menu order", () => {
    const groups = filterNavGroups(NAV_GROUPS, {
      permissionCheck: forRole("user"),
      aiAvailable: true,
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
    expect(
      filterNavGroups(NAV_GROUPS, { permissionCheck: () => false, aiAvailable: true }),
    ).toHaveLength(0);
  });
});

describe("hiddenNavGroups", () => {
  it("lists items the person can open but has hidden", () => {
    const hidden = flattenNavItems(
      hiddenNavGroups(NAV_GROUPS, {
        permissionCheck: forRole("admin"),
        aiAvailable: true,
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
      hiddenNavGroups(NAV_GROUPS, {
        permissionCheck: forRole("admin"),
        aiAvailable: true,
        enabledFeatures: null,
      }),
    ).toHaveLength(0);
  });
});

describe("optionalNavItems", () => {
  it("lists every optional item available to the role and entity", () => {
    expect(
      optionalNavItems(NAV_GROUPS, { permissionCheck: forRole("admin"), aiAvailable: true }),
    ).toHaveLength(MENU_FEATURES.length);
    expect(
      optionalNavItems(NAV_GROUPS, {
        permissionCheck: forRole("admin"),
        aiAvailable: true,
        entityType: "sole_trader",
      }).map((i) => i.feature),
    ).not.toContain("dividends");
  });
});

describe("without AI", () => {
  const filter = { permissionCheck: forRole("admin"), aiAvailable: false } as const;

  it("drops the AI bookkeeper from the menu, hidden items and options", () => {
    const hrefs = (groups: ReturnType<typeof filterNavGroups>) =>
      flattenNavItems(groups).map((i) => i.href);
    expect(hrefs(filterNavGroups(NAV_GROUPS, filter))).not.toContain("/bookkeeper");
    expect(hrefs(filterNavGroups(NAV_GROUPS, { ...filter, aiAvailable: true }))).toContain(
      "/bookkeeper",
    );
    expect(
      hrefs(hiddenNavGroups(NAV_GROUPS, { ...filter, enabledFeatures: [] })),
    ).not.toContain("/bookkeeper");
    expect(optionalNavItems(NAV_GROUPS, filter).map((i) => i.feature)).not.toContain(
      "bookkeeper",
    );
  });

  it("names the AI-only features", () => {
    expect(aiOnlyFeatures(NAV_GROUPS)).toEqual(["bookkeeper"]);
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
