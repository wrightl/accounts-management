import { describe, expect, it } from "vitest";
import {
  compactText,
  fuzzyBestSimilarity,
  fuzzyIncludes,
  fuzzySimilarity,
  normalizeText,
} from "@/lib/bank/fuzzy";

describe("normalizeText", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalizeText("Acme Ltd.")).toBe("acme ltd");
    expect(compactText("DD-2026-0001")).toBe("dd20260001");
  });
});

describe("fuzzyIncludes", () => {
  it("matches exact invoice number in reference", () => {
    expect(fuzzyIncludes("Payment DD-2026-0001", "DD-2026-0001")).toBe(100);
  });

  it("matches compact invoice number without separators", () => {
    expect(fuzzyIncludes("ref DD20260001 paid", "DD-2026-0001")).toBeGreaterThanOrEqual(95);
  });

  it("tolerates minor typos in invoice numbers", () => {
    expect(fuzzyIncludes("DD-2026-0002", "DD-2026-0001")).toBeGreaterThanOrEqual(80);
  });
});

describe("fuzzySimilarity", () => {
  it("matches company names with punctuation differences", () => {
    expect(fuzzySimilarity("Acme Ltd", "ACME LIMITED")).toBeGreaterThanOrEqual(70);
  });

  it("scores partial counterparty matches", () => {
    expect(fuzzySimilarity("ACME CORP", "Acme Corporation")).toBeGreaterThanOrEqual(70);
  });

  it("picks best candidate from several names", () => {
    expect(
      fuzzyBestSimilarity("Acme Ltd", ["Wrong Co", "Acme Ltd", "Other"]),
    ).toBe(100);
  });
});
