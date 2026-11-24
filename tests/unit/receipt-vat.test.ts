import { describe, expect, it } from "vitest";
import { normalizeAiExtraction, parseReceiptText, parseReceiptVat } from "@/lib/expenses/receipt-parse";

describe("parseReceiptVat", () => {
  it("reads the VAT amount, not the rate", () => {
    expect(parseReceiptVat("Coffee 10.00\nVAT 20% 2.00\nTotal 12.00", "12.00")).toBe("2.00");
    expect(parseReceiptVat("VAT @ 20.00% £2.00", "12.00")).toBe("2.00");
    expect(parseReceiptVat("Total VAT: £3.50", "21.00")).toBe("3.50");
  });

  it("takes the first amount after VAT on a line", () => {
    expect(parseReceiptVat("Subtotal 10.00 VAT 2.00 Total 12.00", "12.00")).toBe("2.00");
  });

  it("uses the largest VAT line when a receipt lists VAT per rate and a total", () => {
    expect(parseReceiptVat("VAT 20% 2.00\nVAT 5% 0.50\nTotal VAT 2.50", "30.00")).toBe("2.50");
  });

  it("ignores VAT numbers, totals including VAT and amounts not below the total", () => {
    expect(parseReceiptVat("VAT No. 123 4567 89\nVAT Reg 434031494.00", "12.00")).toBeUndefined();
    expect(parseReceiptVat("Total inc VAT 12.00\nPrice ex VAT 10.00", "12.00")).toBeUndefined();
    expect(parseReceiptVat("VAT 12.00", "12.00")).toBeUndefined();
  });

  it("is part of a parsed receipt", () => {
    const parsed = parseReceiptText("ACME CAFE LTD\n01/06/2026\nLatte 3.00\nVAT 20% 0.50\nTOTAL £3.00");
    expect(parsed.amountPounds).toBe("3.00");
    expect(parsed.vatPounds).toBe("0.50");
  });
});

describe("normalizeAiExtraction", () => {
  it("keeps a sensible VAT amount", () => {
    expect(normalizeAiExtraction({ amountPounds: "12.00", vatPounds: "£2.00" }).vatPounds).toBe("2.00");
  });

  it("drops a VAT amount that is missing, zero or not below the total", () => {
    expect(normalizeAiExtraction({ amountPounds: "12.00", vatPounds: null }).vatPounds).toBeUndefined();
    expect(normalizeAiExtraction({ amountPounds: "12.00", vatPounds: "0" }).vatPounds).toBeUndefined();
    expect(normalizeAiExtraction({ amountPounds: "12.00", vatPounds: "12.00" }).vatPounds).toBeUndefined();
  });
});
