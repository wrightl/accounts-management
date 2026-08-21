import { describe, it, expect } from "vitest";
import {
  formatGBP,
  poundsToPence,
  penceToPounds,
  invoiceTotals,
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
});
