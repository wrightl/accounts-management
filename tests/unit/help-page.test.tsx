// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import HelpPage from "@/app/(app)/help/page";
import type { Role } from "@/lib/roles";

const requireUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

async function renderFor(role: Role, entityType = "limited_company") {
  requireUser.mockResolvedValue({ role, entityType });
  render(await HelpPage());
}

afterEach(cleanup);

describe("help page", () => {
  it("gives accountants their own guide", async () => {
    await renderFor("accountant");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Help for accountants");
    expect(screen.getByRole("heading", { name: "Raising a query" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "First hour" })).toBeNull();
  });

  it.each<Role>(["admin", "user", "pending"])("keeps the existing guide for %s", async (role) => {
    await renderFor(role);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("How to use this app");
    expect(screen.getByRole("heading", { name: "First hour" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Raising a query" })).toBeNull();
  });

  it("leaves limited-company topics out for a sole trader's accountant", async () => {
    await renderFor("accountant", "sole_trader");
    expect(screen.queryByRole("heading", { name: /director's loans/ })).toBeNull();
    expect(screen.queryByRole("link", { name: "Dividends" })).toBeNull();
    expect(screen.queryByText(/opening balances/i)).toBeNull();
  });

  it("only links accountants to pages they can open", async () => {
    await renderFor("accountant");
    const { filterNavGroups, flattenNavItems, NAV_GROUPS, SETTINGS_PAGES } = await import(
      "@/components/dashboard/nav"
    );
    const { can } = await import("@/lib/roles");
    const permissionCheck = (p: Parameters<typeof can>[1]) => can("accountant", p);
    const allowed = new Set([
      ...flattenNavItems(
        filterNavGroups(NAV_GROUPS, {
          permissionCheck,
          entityType: "limited_company",
          aiAvailable: true,
        }),
      ).map((i) => i.href),
      ...SETTINGS_PAGES.filter((p) => permissionCheck(p.permission)).map((p) => p.href),
    ]);
    const hrefs = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href")!)
      .filter((href) => href.startsWith("/"));
    expect(hrefs.length).toBeGreaterThan(0);
    expect(hrefs.filter((href) => !allowed.has(href))).toEqual([]);
  });
});
