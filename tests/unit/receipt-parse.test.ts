import { describe, expect, it } from "vitest";
import {
  detectReceiptCurrency,
  inferReceiptCategory,
  isForeignCurrency,
  normalizeAiExtraction,
  parseReceiptAmount,
  parseReceiptDate,
  parseReceiptMerchant,
  parseReceiptText,
  receiptOcrProviderLabel,
} from "@/lib/expenses/receipt-parse";

const MICROSOFT_INVOICE_TEXT = `Billing Summary

Microsoft Limited
Microsoft Campus
Thames Valley Park
Reading Berkshire RG6 1WG
UK
VAT Reg. No. GB724594615

Sold To

Lee
Apartment 8, Whiteley Wood House
50 Woofindin Avenue
Sheffield
S117FG
GB

Summary

Billing Profile
 
Lee Wright
Billing Number
 
G170397027
Document Date
 
09/07/2026

Total Amount

Due on 09/07/2026

GBP 70.07

Questions on your bill? Visit https://aka.ms/invoice-billing

Tax 20.00%
 
58.39
 
11.68
 
70.07

Subtotal
 
58.39
Total
 
GBP 70.07`;

describe("parseReceiptAmount", () => {
  it("prefers total line amounts", () => {
    expect(
      parseReceiptAmount("Subtotal £10.00\nVAT £2.00\nTOTAL £12.00"),
    ).toBe("12.00");
  });

  it("finds sterling amounts", () => {
    expect(parseReceiptAmount("Paid £45.50 today")).toBe("45.50");
  });

  it("parses GBP-prefixed invoice totals", () => {
    expect(parseReceiptAmount("Total Amount\n\nGBP 70.07")).toBe("70.07");
  });

  it("finds totals separated from the label", () => {
    expect(parseReceiptAmount("Total\n\nGBP 70.07")).toBe("70.07");
  });
});

describe("parseReceiptDate", () => {
  it("parses UK slash dates", () => {
    expect(parseReceiptDate("Date: 23/08/2026")).toBe("2026-08-23");
  });

  it("parses named month dates", () => {
    expect(parseReceiptDate("23 Aug 2026")).toBe("2026-08-23");
  });

  it("parses labeled invoice dates", () => {
    expect(parseReceiptDate("Document Date\n\n09/07/2026")).toBe("2026-07-09");
  });
});

describe("parseReceiptMerchant", () => {
  it("returns first meaningful line", () => {
    expect(
      parseReceiptMerchant("RECEIPT\nPret A Manger\n123 High St\nTotal £5.20"),
    ).toBe("Pret A Manger");
  });

  it("prefers company names on invoices", () => {
    expect(parseReceiptMerchant(MICROSOFT_INVOICE_TEXT)).toBe("Microsoft Limited");
  });
});

describe("detectReceiptCurrency", () => {
  it("detects sterling", () => {
    expect(detectReceiptCurrency("Total GBP 70.07")).toBe("GBP");
    expect(detectReceiptCurrency("Paid £12.00")).toBe("GBP");
  });

  it("prefers foreign currency when mixed markers appear", () => {
    expect(detectReceiptCurrency("Total $49.00 USD\nAlso shows £0.00")).toBe("USD");
  });

  it("detects euro and dollar symbols", () => {
    expect(detectReceiptCurrency("Amount due €19.99")).toBe("EUR");
    expect(detectReceiptCurrency("Total: $9.99")).toBe("USD");
  });

  it("returns undefined when no markers", () => {
    expect(detectReceiptCurrency("Coffee shop receipt")).toBeUndefined();
  });
});

describe("isForeignCurrency", () => {
  it("treats only non-GBP as foreign", () => {
    expect(isForeignCurrency("USD")).toBe(true);
    expect(isForeignCurrency("gbp")).toBe(false);
    expect(isForeignCurrency(null)).toBe(false);
  });
});

describe("inferReceiptCategory", () => {
  it("maps travel keywords", () => {
    expect(inferReceiptCategory("Uber trip London")).toBe("Travel");
  });

  it("maps software keywords", () => {
    expect(inferReceiptCategory("GitHub subscription")).toBe("Software");
  });
});

describe("parseReceiptText", () => {
  it("combines heuristics with confidence", () => {
    const result = parseReceiptText(
      "Starbucks Coffee\n23/08/2026\nTOTAL £4.50",
    );
    expect(result.description).toBe("Starbucks Coffee");
    expect(result.amountPounds).toBe("4.50");
    expect(result.spentAt).toBe("2026-08-23");
    expect(result.category).toBe("Meals");
    expect(result.confidence).toBe("high");
  });

  it("parses Microsoft-style invoice text", () => {
    const result = parseReceiptText(MICROSOFT_INVOICE_TEXT);
    expect(result.description).toBe("Microsoft Limited");
    expect(result.amountPounds).toBe("70.07");
    expect(result.spentAt).toBe("2026-07-09");
    expect(result.category).toBe("Software");
    expect(result.confidence).toBe("high");
  });
});

describe("normalizeAiExtraction", () => {
  it("validates category and date", () => {
    const result = normalizeAiExtraction({
      merchant: "AWS",
      description: "AWS cloud hosting",
      amountPounds: "99.00",
      spentAt: "2026-08-23",
      category: "Software",
    });
    expect(result.category).toBe("Software");
    expect(result.confidence).toBe("high");
  });

  it("drops invalid category", () => {
    const result = normalizeAiExtraction({
      description: "Something",
      category: "Not a category",
    });
    expect(result.category).toBeUndefined();
  });
});

describe("receiptOcrProviderLabel", () => {
  it("labels providers", () => {
    expect(receiptOcrProviderLabel("local")).toContain("Local extraction");
    expect(receiptOcrProviderLabel("ai_gateway")).toContain("AI Gateway");
    expect(receiptOcrProviderLabel("ai_gateway", "openai/gpt-5.4")).toContain(
      "openai/gpt-5.4",
    );
  });
});
