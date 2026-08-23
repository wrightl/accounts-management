import { describe, expect, it } from "vitest";
import {
  buildInboundExpenseDescription,
  matchesInboundAddress,
  mergeReceiptExtractions,
  parseEmailAddressHeader,
  parseEmailBodyText,
  parseExpenseInboundAddresses,
} from "@/lib/expenses/inbound-merge";

describe("parseEmailAddressHeader", () => {
  it("extracts bare email addresses", () => {
    expect(parseEmailAddressHeader("lee@example.com")).toBe("lee@example.com");
  });

  it("extracts email from display name format", () => {
    expect(parseEmailAddressHeader("Lee Wright <lee@example.com>")).toBe("lee@example.com");
  });
});

describe("parseExpenseInboundAddresses", () => {
  it("parses comma-delimited addresses", () => {
    expect(
      parseExpenseInboundAddresses(
        " expenses@dotanddashconsulting.com , receipts@dotanddashconsulting.com ",
      ),
    ).toEqual(["expenses@dotanddashconsulting.com", "receipts@dotanddashconsulting.com"]);
  });
});

describe("matchesInboundAddress", () => {
  it("matches configured inbound address case-insensitively", () => {
    expect(
      matchesInboundAddress(
        ["Expenses <expenses@dotanddashconsulting.com>"],
        "expenses@dotanddashconsulting.com",
      ),
    ).toBe(true);
    expect(matchesInboundAddress(["other@example.com"], "expenses@dotanddashconsulting.com")).toBe(
      false,
    );
  });

  it("matches any address in a comma-delimited list", () => {
    const expected =
      "expenses@dotanddashconsulting.com, receipts@dotanddashconsulting.com";
    expect(
      matchesInboundAddress(["Receipts <receipts@dotanddashconsulting.com>"], expected),
    ).toBe(true);
    expect(matchesInboundAddress(["other@example.com"], expected)).toBe(false);
  });
});

describe("mergeReceiptExtractions", () => {
  it("prefers higher-confidence OCR fields", () => {
    const merged = mergeReceiptExtractions(
      { confidence: "partial", description: "Email subject" },
      {
        confidence: "high",
        description: "Coffee Shop",
        amountPounds: "12.50",
        spentAt: "2026-03-01",
        category: "Meals",
      },
    );

    expect(merged.description).toBe("Coffee Shop");
    expect(merged.amountPounds).toBe("12.50");
    expect(merged.spentAt).toBe("2026-03-01");
    expect(merged.category).toBe("Meals");
    expect(merged.confidence).toBe("high");
  });

  it("fills gaps from lower-confidence sources", () => {
    const merged = mergeReceiptExtractions(
      { confidence: "partial", amountPounds: "9.99", description: "Taxi receipt" },
      { confidence: "none" },
    );

    expect(merged.amountPounds).toBe("9.99");
    expect(merged.description).toBe("Taxi receipt");
  });
});

describe("parseEmailBodyText", () => {
  it("extracts amount and merchant hints from subject/body", () => {
    const result = parseEmailBodyText(
      "Uber trip receipt",
      "Total paid £18.40 on 12/03/2026",
    );

    expect(result.amountPounds).toBe("18.40");
    expect(result.spentAt).toBe("2026-03-12");
    expect(result.category).toBe("Travel");
  });
});

describe("buildInboundExpenseDescription", () => {
  it("falls back to subject then default label", () => {
    expect(
      buildInboundExpenseDescription({ confidence: "none" }, "March expenses"),
    ).toBe("March expenses");
    expect(buildInboundExpenseDescription({ confidence: "none" }, "")).toBe("Expense from email");
  });
});
