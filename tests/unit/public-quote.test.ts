import { describe, it, expect } from "vitest";
import {
  generatePublicQuoteToken,
  publicQuoteUrl,
} from "@/lib/quotes/public-token";
import { quoteEmailHtml, defaultQuoteEmailMessage } from "@/lib/quotes/email";

describe("public quote tokens", () => {
  it("generates unique URL-safe tokens", () => {
    const a = generatePublicQuoteToken();
    const b = generatePublicQuoteToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(20);
    expect(publicQuoteUrl(a)).toContain(`/q/${a}`);
  });
});

describe("quote email", () => {
  it("includes accept link and CTAs when publicUrl set", () => {
    const html = quoteEmailHtml({
      message: "Please review",
      publicUrl: "https://example.com/q/abc",
    });
    expect(html).toContain("https://example.com/q/abc");
    expect(html).toContain("Accept quote");
    expect(html).toContain("Decline");
  });

  it("embeds public URL in default message", () => {
    const msg = defaultQuoteEmailMessage({
      number: "Q-1",
      version: 1,
      grossFormatted: "£100.00",
      companyName: "Acme",
      publicUrl: "https://example.com/q/tok",
    });
    expect(msg).toContain("https://example.com/q/tok");
  });
});
