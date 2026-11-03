import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { ASSISTANT_TOOLS, assistantToolsFor } = await import("@/lib/assistant/tools/catalog");

const names = (role: Parameters<typeof assistantToolsFor>[0]["role"], isLtd: boolean) =>
  assistantToolsFor({ role, isLtd }).map((t) => t.name);

describe("assistant tools by role", () => {
  it("gives founders of a limited company every tool", () => {
    const all = ASSISTANT_TOOLS.map((t) => t.name);
    expect(names("admin", true)).toEqual(all);
    expect(names("user", true)).toEqual(all);
  });

  it("leaves reserves, safe to pay and director's loans out for sole traders", () => {
    const soleTrader = names("admin", false);
    expect(soleTrader).not.toContain("reserves_and_corporation_tax");
    expect(soleTrader).not.toContain("safe_to_pay_yourself");
    expect(soleTrader).not.toContain("directors_loans");
    expect(soleTrader).toContain("profit_and_loss");
  });

  it("gives accountants only what their screens show", () => {
    expect(names("accountant", true).sort()).toEqual([
      "accountant_queries",
      "company_overview",
      "directors_loans",
      "expenses_by_category",
      "get_invoice",
      "income_by_month",
      "money_owed_by_clients",
      "profit_and_loss",
      "reserves_and_corporation_tax",
      "search_bank_payments",
      "search_expenses",
      "search_invoices",
      "upcoming_deadlines",
      "vat_summary",
    ]);
  });

  it("gives pending and platform roles nothing", () => {
    expect(names("pending", true)).toEqual([]);
    expect(names("platform_admin", true)).toEqual([]);
    expect(names(null, true)).toEqual([]);
  });

  it("names every tool once", () => {
    const all = ASSISTANT_TOOLS.map((t) => t.name);
    expect(new Set(all).size).toBe(all.length);
  });
});
