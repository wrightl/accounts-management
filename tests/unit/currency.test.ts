import { describe, expect, it } from "vitest";
import {
  DOCUMENT_CURRENCIES,
  STERLING_RATE,
  convertTotals,
  documentTotals,
  isDocumentCurrency,
  sterlingTotals,
  toSterlingPence,
} from "@/lib/currency";
import { formatDocumentAmount, formatMoney, parseMoneyToMinor } from "@/lib/money";

describe("document currencies", () => {
  it("offers sterling and two-decimal BoE currencies, not JPY", () => {
    expect(DOCUMENT_CURRENCIES[0]).toBe("GBP");
    expect(DOCUMENT_CURRENCIES).toContain("USD");
    expect(DOCUMENT_CURRENCIES).toContain("EUR");
    expect(DOCUMENT_CURRENCIES).not.toContain("JPY");
    expect(isDocumentCurrency(" usd ")).toBe(true);
    expect(isDocumentCurrency("JPY")).toBe(false);
  });
});

describe("converting to sterling", () => {
  it("leaves sterling untouched", () => {
    expect(toSterlingPence(12345, 1)).toBe(12345);
    const lines = [{ quantity: 1.5, unitPricePence: 10001, vatRate: 20 }];
    const t = documentTotals(lines, STERLING_RATE);
    expect(t).toEqual({ ...sterlingTotals(t) });
    expect(t.grossMinor).toBe(t.grossPence);
  });

  it("converts net and VAT separately so gross always adds up", () => {
    // Rates chosen so rounding the gross on its own would differ by a penny.
    for (const fxRate of [1.2731, 1.1567, 1.3333, 0.8571]) {
      for (const net of [7000, 9999, 12345, 1]) {
        const t = convertTotals({ netMinor: net, vatMinor: Math.round(net * 0.2) }, {
          currency: "USD",
          fxRate,
        });
        expect(t.grossPence).toBe(t.netPence + t.vatPence);
        expect(t.grossMinor).toBe(t.netMinor + t.vatMinor);
        expect(Math.abs(t.netPence - t.netMinor / fxRate)).toBeLessThanOrEqual(0.5);
      }
    }
  });

  it("converts $70 at 1.2731 to £54.98", () => {
    expect(toSterlingPence(7000, 1.2731)).toBe(5498);
  });

  it("rejects a missing or nonsense rate", () => {
    expect(() => toSterlingPence(100, 0)).toThrow();
    expect(() => toSterlingPence(100, Number.NaN)).toThrow();
  });

  it("copies only the totals for a sterling document", () => {
    const t = sterlingTotals({ netPence: 100, vatPence: 20, grossPence: 120, extra: 1 } as never);
    expect(Object.keys(t).sort()).toEqual(
      ["grossMinor", "grossPence", "netMinor", "netPence", "vatMinor", "vatPence"].sort(),
    );
  });
});

describe("formatting", () => {
  it("formats in the document's currency", () => {
    expect(formatMoney(7000, "USD")).toBe("US$70.00");
    expect(formatMoney(7000, "GBP")).toBe("£70.00");
    expect(formatMoney(7000, null)).toBe("£70.00");
  });

  it("adds the sterling value for foreign amounts only", () => {
    expect(formatDocumentAmount(7000, 5498, "USD")).toBe("US$70.00 (£54.98)");
    expect(formatDocumentAmount(5498, 5498, "GBP")).toBe("£54.98");
  });

  it("parses amounts typed with any currency symbol", () => {
    expect(parseMoneyToMinor("US$1,234.56")).toBe(123456);
    expect(parseMoneyToMinor("€70")).toBe(7000);
    expect(parseMoneyToMinor(70.5)).toBe(7050);
  });
});
