import { describe, expect, it } from "vitest";
import {
  allowedQuoteTransitions,
  canTransitionQuote,
  isQuoteLocked,
} from "@/lib/quotes/transitions";

describe("quote transitions", () => {
  it("allows draft to sent, accepted, declined", () => {
    expect(allowedQuoteTransitions("draft")).toEqual(["sent", "accepted", "declined"]);
  });

  it("allows sent to accepted and declined only", () => {
    expect(allowedQuoteTransitions("sent")).toEqual(["accepted", "declined"]);
  });

  it("allows declined to reopen as draft", () => {
    expect(allowedQuoteTransitions("declined")).toEqual(["draft"]);
    expect(canTransitionQuote("declined", "draft")).toBe(true);
  });

  it("locks accepted and declined for editing", () => {
    expect(allowedQuoteTransitions("accepted")).toEqual([]);
    expect(isQuoteLocked("accepted")).toBe(true);
    expect(isQuoteLocked("declined")).toBe(true);
  });

  it("validates transitions", () => {
    expect(canTransitionQuote("draft", "sent")).toBe(true);
    expect(canTransitionQuote("sent", "accepted")).toBe(true);
    expect(canTransitionQuote("accepted", "sent")).toBe(false);
    expect(canTransitionQuote("declined", "draft")).toBe(true);
    expect(canTransitionQuote("declined", "sent")).toBe(false);
  });
});
