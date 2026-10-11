import { describe, it, expect } from "vitest";
import {
  formatDiscountPercent,
  formatGBP,
  formatQuantity,
  hasLineDiscount,
  poundsToPence,
  penceToPounds,
  invoiceTotals,
  lineNetPence,
  lineVatPence,
} from "@/lib/money";

describe("money", () => {
  it("formats pence as GBP", () => {
    expect(formatGBP(12345)).toBe("£123.45");
    expect(formatGBP(0)).toBe("£0.00");
    expect(formatGBP(-500)).toBe("-£5.00");
  });

  it("parses pounds into integer pence", () => {
    expect(poundsToPence("123.45")).toBe(12345);
    expect(poundsToPence("£1,000")).toBe(100000);
    expect(poundsToPence(9.99)).toBe(999);
  });

  it("round-trips pence and pounds", () => {
    expect(penceToPounds(poundsToPence("42.50"))).toBe(42.5);
  });

  it("throws on invalid amounts", () => {
    expect(() => poundsToPence("abc")).toThrow();
  });

  it("computes line VAT", () => {
    expect(lineVatPence({ quantity: 2, unitPricePence: 10000, vatRate: 20 })).toBe(4000);
    expect(lineVatPence({ quantity: 1, unitPricePence: 10000 })).toBe(0);
  });

  it("totals an invoice with mixed VAT rates", () => {
    const totals = invoiceTotals([
      { quantity: 2, unitPricePence: 10000, vatRate: 20 }, // net 20000 vat 4000
      { quantity: 1, unitPricePence: 5000 }, // net 5000 vat 0
    ]);
    expect(totals).toEqual({ netPence: 25000, vatPence: 4000, grossPence: 29000 });
  });

  it("prices fractional quantities", () => {
    expect(lineNetPence({ quantity: 1.5, unitPricePence: 65000 })).toBe(97500);
    expect(lineNetPence({ quantity: 7.25, unitPricePence: 8000 })).toBe(58000);
    // 0.333 × £10.00 = £3.33 (rounded to the nearest penny)
    expect(lineNetPence({ quantity: 0.333, unitPricePence: 1000 })).toBe(333);
  });

  it("applies line discounts before VAT", () => {
    const line = { quantity: 2.5, unitPricePence: 65000, vatRate: 20, discountPercent: 10 };
    // 2.5 × £650 = £1,625, less 10% = £1,462.50, VAT £292.50
    expect(lineNetPence(line)).toBe(146250);
    expect(lineVatPence(line)).toBe(29250);
    expect(invoiceTotals([line])).toEqual({
      netPence: 146250,
      vatPence: 29250,
      grossPence: 175500,
    });
  });

  it("treats a 100% discount as a free line", () => {
    expect(lineNetPence({ quantity: 3, unitPricePence: 5000, discountPercent: 100 })).toBe(0);
  });

  it("formats quantities and discounts for display", () => {
    expect(formatQuantity(2)).toBe("2");
    expect(formatQuantity(1.5)).toBe("1.5");
    expect(formatQuantity(1234.125)).toBe("1,234.125");
    expect(formatDiscountPercent(12.5)).toBe("12.5%");
    expect(formatDiscountPercent(0)).toBe("");
    expect(formatDiscountPercent(undefined)).toBe("");
  });

  it("detects whether any line has a discount", () => {
    expect(hasLineDiscount([{ discountPercent: 0 }, {}])).toBe(false);
    expect(hasLineDiscount([{ discountPercent: 0 }, { discountPercent: 5 }])).toBe(true);
  });
});
