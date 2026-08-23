import { describe, expect, it } from "vitest";
import { splitDividendPence } from "@/lib/dividends/split";

describe("splitDividendPence", () => {
  it("splits equally across equal shareholdings", () => {
    const result = splitDividendPence(
      10_000,
      [
        { id: "a", name: "A", shareCount: 50 },
        { id: "b", name: "B", shareCount: 50 },
      ],
      100,
    );
    expect(result.map((r) => r.amountPence)).toEqual([5000, 5000]);
    expect(result.reduce((s, r) => s + r.amountPence, 0)).toBe(10_000);
  });

  it("splits unequally by share count", () => {
    const result = splitDividendPence(
      10_000,
      [
        { id: "a", name: "A", shareCount: 75 },
        { id: "b", name: "B", shareCount: 25 },
      ],
      100,
    );
    expect(result.map((r) => r.amountPence)).toEqual([7500, 2500]);
  });

  it("uses largest remainder so parts sum exactly", () => {
    const result = splitDividendPence(
      100,
      [
        { id: "a", name: "A", shareCount: 1 },
        { id: "b", name: "B", shareCount: 1 },
        { id: "c", name: "C", shareCount: 1 },
      ],
      3,
    );
    expect(result.reduce((s, r) => s + r.amountPence, 0)).toBe(100);
    expect(result.every((r) => r.amountPence === 33 || r.amountPence === 34)).toBe(
      true,
    );
    expect(result.filter((r) => r.amountPence === 34)).toHaveLength(1);
  });

  it("rejects mismatched share totals", () => {
    expect(() =>
      splitDividendPence(
        1000,
        [{ id: "a", name: "A", shareCount: 40 }],
        100,
      ),
    ).toThrow(/must equal total shares/);
  });
});
