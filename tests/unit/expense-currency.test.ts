import { describe, it, expect } from "vitest";
import { expenseOriginalAmount } from "@/lib/expenses/currency";
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
