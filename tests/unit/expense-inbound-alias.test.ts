import { describe, expect, it } from "vitest";
import {
  inboundAliasError,
  isValidInboundAlias,
  normalizeInboundAlias,
} from "@/lib/expenses/inbound-alias";
import {
  defaultInboundAliasCandidates,
  externalSenderOf,
  inboundMailboxCandidates,
  matchesInboundMailboxPattern,
  parseInboundAlias,
  senderAuthenticated,
} from "@/lib/expenses/inbound-merge";

const config = {
  domain: "dotanddashconsulting.com",
  prefix: "expenses",
};

describe("inboundAliasError", () => {
  it("accepts letters and numbers with single dots or hyphens", () => {
    for (const alias of ["lee", "lee.wright", "lee-wright", "lee2", "l-e.e"]) {
      expect(inboundAliasError(alias)).toBeNull();
    }
  });

  it("rejects bad shapes", () => {
    for (const alias of ["le", "a".repeat(31), "lee..w", ".lee", "lee-", "lee+x", "lee_w", "Lee"]) {
      expect(isValidInboundAlias(alias)).toBe(false);
    }
  });

  it("rejects mailbox names that belong to the domain", () => {
    expect(inboundAliasError("postmaster")).toMatch(/reserved/);
    expect(inboundAliasError("receipts")).toMatch(/reserved/);
  });

  it("normalises case and whitespace", () => {
    expect(normalizeInboundAlias("  Lee.Wright ")).toBe("lee.wright");
  });
});

describe("defaultInboundAliasCandidates", () => {
  it("offers first name, first.last, then first-company, then numbered", () => {
    expect(defaultInboundAliasCandidates("Lee Wright", "x@example.com", "acme", 2)).toEqual([
      "lee",
      "lee.wright",
      "lee-acme",
      "lee-acme-2",
      "lee-acme-3",
    ]);
  });

  it("falls back to the email local part", () => {
    expect(defaultInboundAliasCandidates(null, "pat.jones@example.com", "acme", 0)).toEqual([
      "pat",
      "pat.jones",
      "pat-acme",
    ]);
  });

  it("skips names too short to stand alone and keeps within the length limit", () => {
    const out = defaultInboundAliasCandidates("Li", "li@example.com", "a-very-long-company-name-limited", 1);
    expect(out[0]).toBe("li-a-very-long-company-name-li");
    expect(out.every((a) => a.length <= 30 && isValidInboundAlias(a))).toBe(true);
  });
});

describe("parseInboundAlias / inboundMailboxCandidates", () => {
  it("parses short addresses on the inbound domain only", () => {
    expect(parseInboundAlias("Lee <Lee@dotanddashconsulting.com>", config)).toEqual({
      alias: "lee",
      address: "lee@dotanddashconsulting.com",
    });
    expect(parseInboundAlias("lee@example.com", config)).toBeNull();
    expect(parseInboundAlias("expenses+acme.lee@dotanddashconsulting.com", config)).toBeNull();
  });

  it("lists short and legacy mailboxes in order, once each", () => {
    expect(
      inboundMailboxCandidates(
        [
          "someone@example.com",
          "lee@dotanddashconsulting.com",
          "expenses+acme.lee@dotanddashconsulting.com",
          "LEE@dotanddashconsulting.com",
        ],
        config,
      ),
    ).toEqual(["lee@dotanddashconsulting.com", "expenses+acme.lee@dotanddashconsulting.com"]);
    expect(matchesInboundMailboxPattern(["lee@dotanddashconsulting.com"], config)).toBe(true);
    expect(matchesInboundMailboxPattern(["postmaster@dotanddashconsulting.com"], config)).toBe(false);
  });
});

describe("senderAuthenticated", () => {
  it("is false without Resend's authentication result", () => {
    expect(senderAuthenticated(null)).toBe(false);
    expect(senderAuthenticated(undefined)).toBe(false);
  });

  it("trusts DMARC, or aligned DKIM when the domain has no DMARC policy", () => {
    expect(senderAuthenticated({ spf: "fail", dkim: "fail", dmarc: "pass" })).toBe(true);
    expect(senderAuthenticated({ spf: "pass", dkim: "pass", dmarc: "gray" })).toBe(true);
  });

  it("doesn't trust a DMARC failure, unaligned DKIM, or SPF alone", () => {
    expect(senderAuthenticated({ spf: "pass", dkim: "pass", dmarc: "fail" })).toBe(false);
    expect(senderAuthenticated({ spf: "pass", dkim: "gray", dmarc: "gray" })).toBe(false);
    expect(senderAuthenticated({ spf: "pass", dkim: "unknown", dmarc: "unknown" })).toBe(false);
  });
});

describe("externalSenderOf", () => {
  it("is null only when the owner's address passes the checks", () => {
    expect(externalSenderOf("Lee <LEE@example.com>", "lee@example.com", true)).toBeNull();
  });

  it("flags anyone else, and the owner's address when the checks don't pass", () => {
    expect(externalSenderOf("billing@shop.com", "lee@example.com", true)).toBe("billing@shop.com");
    expect(externalSenderOf("lee@example.com", "lee@example.com", false)).toBe("lee@example.com");
  });
});
