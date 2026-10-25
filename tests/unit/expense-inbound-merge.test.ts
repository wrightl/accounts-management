import { describe, expect, it } from "vitest";
import {
  buildInboundExpenseDescription,
  formatExpenseInboundAddress,
  isValidInboundSlug,
  matchesInboundMailboxPattern,
  mergeReceiptExtractions,
  parseEmailAddressHeader,
  parseEmailBodyText,
  parseInboundMailbox,
  pickReceiptAttachments,
  planInboundExpenses,
  resolveInboundSpentAt,
  slugifyInbound,
  tokenizedInboundSlug,
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

describe("resolveInboundSpentAt", () => {
  const body = { confidence: "high" as const, spentAt: "2026-10-20" };
  const receipt = { confidence: "partial" as const, spentAt: "2026-10-18" };

  it("prefers the attachment's date over the email body's", () => {
    expect(resolveInboundSpentAt(body, [receipt], "2026-10-21T09:00:00Z")).toBe("2026-10-18");
  });

  it("falls back to the email body's date", () => {
    expect(
      resolveInboundSpentAt(body, [{ confidence: "none" }], "2026-10-21T09:00:00Z"),
    ).toBe("2026-10-20");
  });

  it("falls back to the London day the email arrived", () => {
    // 23:30 UTC in BST is already the next day in London.
    expect(
      resolveInboundSpentAt({ confidence: "none" }, [], "2026-07-14T23:30:00Z"),
    ).toBe("2026-07-15");
  });

  it("returns undefined with nothing to go on", () => {
    expect(resolveInboundSpentAt({ confidence: "none" }, [], "not a date")).toBeUndefined();
    expect(resolveInboundSpentAt({ confidence: "none" }, [], null)).toBeUndefined();
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

describe("tokenizedInboundSlug", () => {
  it("appends an unguessable token to a readable, valid slug", () => {
    const slug = tokenizedInboundSlug("Lee Wright");
    expect(slug).toMatch(/^lee-wright-[a-z0-9]{10}$/);
    expect(isValidInboundSlug(slug)).toBe(true);
  });

  it("stays within the slug budget for long names", () => {
    const slug = tokenizedInboundSlug("a".repeat(80));
    expect(slug.length).toBeLessThanOrEqual(48);
    expect(isValidInboundSlug(slug)).toBe(true);
  });

  it("produces a different token each time", () => {
    expect(tokenizedInboundSlug("pat")).not.toBe(tokenizedInboundSlug("pat"));
  });
});

describe("pickReceiptAttachments", () => {
  it("ignores inline parts when the email has real attachments", () => {
    const picked = pickReceiptAttachments([
      { id: "logo", content_disposition: "inline" },
      { id: "a", content_disposition: "attachment" },
      { id: "b", content_disposition: "attachment" },
    ]);
    expect(picked.map((a) => a.id)).toEqual(["a", "b"]);
  });

  it("falls back to inline parts when there is nothing attached", () => {
    const picked = pickReceiptAttachments([
      { id: "photo", content_disposition: "inline" },
    ]);
    expect(picked.map((a) => a.id)).toEqual(["photo"]);
  });
});

describe("planInboundExpenses", () => {
  const received = new Date("2026-03-10T12:00:00Z");
  const body = {
    amountPounds: "99.00",
    spentAt: "2026-03-01",
    confidence: "partial" as const,
  };

  it("makes one expense from the body when there are no receipts", () => {
    const drafts = planInboundExpenses(body, [], "Lunch", received);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].extraction.amountPounds).toBe("99.00");
    expect(drafts[0].spentAt).toBe("2026-03-01");
    expect(drafts[0].description).toBe("Lunch");
  });

  it("merges the body into a single receipt", () => {
    const drafts = planInboundExpenses(
      body,
      [{ description: "Pret", confidence: "partial" }],
      "Lunch",
      received,
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0].description).toBe("Pret");
    expect(drafts[0].extraction.amountPounds).toBe("99.00");
  });

  it("makes one expense per receipt without borrowing body fields", () => {
    const drafts = planInboundExpenses(
      body,
      [
        {
          description: "Pret",
          amountPounds: "4.50",
          spentAt: "2026-03-05",
          confidence: "high",
        },
        null,
      ],
      "Receipts",
      received,
    );
    expect(drafts).toHaveLength(2);
    expect(drafts[0].description).toBe("Pret");
    expect(drafts[0].extraction.amountPounds).toBe("4.50");
    expect(drafts[0].spentAt).toBe("2026-03-05");
    // OCR failed: fall back to the subject and arrival day, not the body's £99.
    expect(drafts[1].description).toBe("Receipts");
    expect(drafts[1].extraction.amountPounds).toBeUndefined();
    expect(drafts[1].spentAt).toBe("2026-03-10");
  });
});
