import { describe, it, expect } from "vitest";
import {
  expenseOriginalAmount,
  isAllowedExpenseCurrency,
  needsAmountCheck,
} from "@/lib/expenses/currency";
import { formatExpenseAmount } from "@/lib/money";

describe("formatExpenseAmount", () => {
  it("shows sterling, then the amount paid in another currency", () => {
    expect(
      formatExpenseAmount({ amountPence: 960, detectedCurrency: "USD", originalAmountMinor: 1200 }),
    ).toBe("£9.60 (US$12.00)");
  });

  it("shows only sterling for a GBP expense", () => {
    expect(
      formatExpenseAmount({ amountPence: 960, detectedCurrency: null, originalAmountMinor: null }),
    ).toBe("£9.60");
  });
});

describe("expenseOriginalAmount", () => {
  it("returns the foreign currency and amount", () => {
    expect(expenseOriginalAmount({ detectedCurrency: "eur", originalAmountMinor: 500 })).toEqual({
      currency: "EUR",
      amountMinor: 500,
    });
  });

  it("treats an older expense with no original amount as sterling", () => {
    expect(expenseOriginalAmount({ detectedCurrency: "USD", originalAmountMinor: null })).toBeNull();
    expect(expenseOriginalAmount({ detectedCurrency: "GBP", originalAmountMinor: 500 })).toBeNull();
  });
});

describe("needsAmountCheck", () => {
  const pending = {
    status: "pending",
    amountPence: 1200,
    detectedCurrency: "USD",
    originalAmountMinor: 1200,
  };

  it("flags a pending foreign expense with the same figure in both amounts", () => {
    expect(needsAmountCheck(pending)).toBe(true);
  });

  it("doesn't flag converted, unconverted, approved or sterling expenses", () => {
    expect(needsAmountCheck({ ...pending, amountPence: 960 })).toBe(false);
    expect(needsAmountCheck({ ...pending, amountPence: 0 })).toBe(false);
    expect(needsAmountCheck({ ...pending, status: "recorded" })).toBe(false);
    expect(needsAmountCheck({ ...pending, detectedCurrency: null })).toBe(false);
  });
});

describe("isAllowedExpenseCurrency", () => {
  it("accepts the listed currencies, and the one already on the expense", () => {
    expect(isAllowedExpenseCurrency("USD")).toBe(true);
    expect(isAllowedExpenseCurrency("GBP")).toBe(true);
    expect(isAllowedExpenseCurrency("HKD")).toBe(false);
    expect(isAllowedExpenseCurrency("HKD", "hkd")).toBe(true);
    expect(isAllowedExpenseCurrency("HKD", "USD")).toBe(false);
  });
});
