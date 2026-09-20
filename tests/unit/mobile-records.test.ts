import { describe, expect, it } from "vitest";
import { toMobileExpense } from "@/lib/mobile/expense-payload";
import { canAccessResource } from "@/lib/mobile/resources";
import type { SessionUser } from "@/lib/auth";

function user(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    userId: "user_1",
    email: "lee@test.com",
    name: "Lee",
    role: "admin",
    localUserId: "local_1",
    companyId: "co_1",
    entityType: "limited_company",
    ...overrides,
  };
}

describe("toMobileExpense", () => {
  it("coalesces null category, date, and source", () => {
    const payload = toMobileExpense({
      id: "e1",
      companyId: "co_1",
      description: null,
      amountPence: 1200,
      category: null,
      spentAt: null,
      status: "pending",
      billable: null,
      source: null,
      createdAt: new Date("2026-09-01T12:00:00Z"),
      receipts: [{ id: "r1", filename: null, uploadedAt: new Date("2026-09-01T12:00:00Z") }],
    });

    expect(payload.description).toBe("");
    expect(payload.category).toBe("Other");
    expect(payload.expenseDate).toBe("2026-09-01");
    expect(payload.source).toBe("manual");
    expect(payload.billable).toBe(false);
    expect(payload.receipts[0]?.filename).toBe("receipt");
  });
});

describe("canAccessResource", () => {
  it("hides dividends from sole traders", () => {
    expect(
      canAccessResource(
        "dividends",
        user({ role: "user", entityType: "sole_trader" }),
      ),
    ).toBe(false);
    expect(canAccessResource("dividends", user({ role: "user" }))).toBe(true);
  });

  it("restricts settings to admins", () => {
    expect(canAccessResource("settings", user({ role: "user" }))).toBe(false);
    expect(canAccessResource("settings", user({ role: "admin" }))).toBe(true);
  });
});
