import { describe, expect, it } from "vitest";
import { matchDuplicates, type DuplicateCandidate } from "@/lib/expenses/duplicates";

function expense(overrides: Partial<DuplicateCandidate> & { id: string }): DuplicateCandidate {
  return {
    description: "Lunch",
    spentAt: "2026-11-02",
    amountPence: 1_200,
    detectedCurrency: null,
    originalAmountMinor: null,
    createdAt: new Date("2026-11-02T10:00:00Z"),
    receiptHashes: [],
    ...overrides,
  };
}

describe("matchDuplicates", () => {
  it("doesn't match an expense with itself", () => {
    const target = expense({ id: "a", receiptHashes: ["h"] });
    expect(matchDuplicates([target], [target]).size).toBe(0);
  });

  it("puts same-receipt matches first, then the oldest", () => {
    const target = expense({ id: "t", receiptHashes: ["h"] });
    const newer = expense({ id: "newer", createdAt: new Date("2026-11-03") });
    const older = expense({ id: "older", createdAt: new Date("2026-11-01") });
    const sameFile = expense({ id: "file", amountPence: 1, spentAt: null, receiptHashes: ["h"] });

    const ids = matchDuplicates([target], [newer, older, sameFile]).get("t")?.map((m) => m.id);
    expect(ids).toEqual(["file", "older", "newer"]);
  });

  it("doesn't match a zero amount or a missing date", () => {
    expect(
      matchDuplicates(
        [expense({ id: "t", amountPence: 0 })],
        [expense({ id: "o", amountPence: 0 })],
      ).size,
    ).toBe(0);
    expect(
      matchDuplicates([expense({ id: "t", spentAt: null })], [expense({ id: "o", spentAt: null })])
        .size,
    ).toBe(0);
  });

  it("matches a foreign receipt on its original amount", () => {
    const target = expense({ id: "t", amountPence: 0, detectedCurrency: "USD", originalAmountMinor: 1_500 });
    const other = expense({ id: "o", amountPence: 1_180, detectedCurrency: "usd", originalAmountMinor: 1_500 });
    expect(matchDuplicates([target], [other]).get("t")?.[0]?.id).toBe("o");
  });
});
