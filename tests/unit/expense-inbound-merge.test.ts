import { describe, expect, it } from "vitest";
import {
  buildInboundExpenseDescription,
  formatExpenseInboundAddress,
  matchesInboundMailboxPattern,
  mergeReceiptExtractions,
  parseEmailAddressHeader,
  parseEmailBodyText,
  parseInboundMailbox,
  slugifyInbound,
} from "@/lib/expenses/inbound-merge";

const config = {
  domain: "dotanddashconsulting.com",
  prefix: "expenses",
};

describe("parseEmailAddressHeader", () => {
  it("extracts bare email addresses", () => {
    expect(parseEmailAddressHeader("lee@example.com")).toBe("lee@example.com");
  });

  it("extracts email from display name format", () => {
    expect(parseEmailAddressHeader("Lee Wright <lee@example.com>")).toBe("lee@example.com");
  });
});

describe("parseInboundMailbox", () => {
  it("parses plus-tag company.user addresses", () => {
    expect(
      parseInboundMailbox("expenses+dot-dash.lee@dotanddashconsulting.com", config),
    ).toEqual({
      companySlug: "dot-dash",
      userSlug: "lee",
      address: "expenses+dot-dash.lee@dotanddashconsulting.com",
    });
  });

  it("extracts from display-name To headers", () => {
    expect(
      parseInboundMailbox(
        "Expenses <expenses+acme.angel@dotanddashconsulting.com>",
        config,
      ),
    ).toEqual({
      companySlug: "acme",
      userSlug: "angel",
      address: "expenses+acme.angel@dotanddashconsulting.com",
    });
  });

  it("splits company and user on the first dot", () => {
    expect(
      parseInboundMailbox("expenses+my-co.lee-wright@dotanddashconsulting.com", config),
    ).toEqual({
      companySlug: "my-co",
      userSlug: "lee-wright",
      address: "expenses+my-co.lee-wright@dotanddashconsulting.com",
    });
  });

  it("rejects user tags that are not valid slugs", () => {
    expect(
      parseInboundMailbox("expenses+acme.lee.wright@dotanddashconsulting.com", config),
    ).toBeNull();
  });

  it("rejects wrong domain or prefix", () => {
    expect(
      parseInboundMailbox("expenses+dot-dash.lee@other.com", config),
    ).toBeNull();
    expect(
      parseInboundMailbox("receipts+dot-dash.lee@dotanddashconsulting.com", config),
    ).toBeNull();
    expect(
      parseInboundMailbox("expenses@dotanddashconsulting.com", config),
    ).toBeNull();
  });

  it("rejects invalid slugs", () => {
    expect(
      parseInboundMailbox("expenses+Dot_Dash.lee@dotanddashconsulting.com", config),
    ).toBeNull();
    expect(
      parseInboundMailbox("expenses+acme.@dotanddashconsulting.com", config),
    ).toBeNull();
  });
});

describe("matchesInboundMailboxPattern", () => {
  it("matches when any recipient is a plus-address", () => {
    expect(
      matchesInboundMailboxPattern(
        ["cc@example.com", "expenses+acme.lee@dotanddashconsulting.com"],
        config,
      ),
    ).toBe(true);
    expect(matchesInboundMailboxPattern(["other@example.com"], config)).toBe(false);
  });
});

describe("formatExpenseInboundAddress / slugifyInbound", () => {
  it("formats the display address", () => {
    expect(formatExpenseInboundAddress("dot-dash", "lee", config)).toBe(
      "expenses+dot-dash.lee@dotanddashconsulting.com",
    );
  });

  it("slugifies names", () => {
    expect(slugifyInbound("Dot + Dash Consulting")).toBe("dot-dash-consulting");
    expect(slugifyInbound("Lee Wright")).toBe("lee-wright");
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
    expect(merged.confidence).toBe("partial");
  });
});

describe("parseEmailBodyText / buildInboundExpenseDescription", () => {
  it("extracts amount from body text", () => {
    const extracted = parseEmailBodyText("Coffee", "Total £12.50");
    expect(extracted.amountPounds).toBeTruthy();
  });

  it("falls back to subject for description", () => {
    expect(
      buildInboundExpenseDescription({ confidence: "none" }, "Lunch receipt"),
    ).toBe("Lunch receipt");
  });
});
