import { describe, it, expect } from "vitest";
import { pickBestMatch, scoreMatch } from "@/lib/bank/match";

const tx = {
  amountPence: 25000,
  bookedAt: "2026-04-02",
  reference: "DD-2026-0001 lunch",
  description: null,
};

describe("bank match scorer", () => {
  it("rejects amount mismatches", () => {
    expect(
      scoreMatch(tx, { id: "a", amountPence: 24999, date: "2026-04-02" }),
    ).toBe(0);
  });

  it("rejects dates outside the ±3 day window", () => {
    expect(
      scoreMatch(tx, { id: "a", amountPence: 25000, date: "2026-03-28" }),
    ).toBe(0);
  });

  it("prefers an invoice number found in the bank reference", () => {
    const withNumber = {
      id: "hit",
      amountPence: 25000,
      date: "2026-04-01",
      invoiceNumber: "DD-2026-0001",
    };
    const sameAmount = {
      id: "miss",
      amountPence: 25000,
      date: "2026-04-02",
    };
    expect(scoreMatch(tx, withNumber)).toBeGreaterThan(scoreMatch(tx, sameAmount));
    expect(pickBestMatch(tx, [sameAmount, withNumber])?.id).toBe("hit");
  });
});
