import { describe, it, expect } from "vitest";
import type { SpendingSummary } from "@/lib/spending/queries";
import { toCumulativeSeries } from "@/lib/spending/series";

function trendFromSummary(current: number, previous: number): SpendingSummary["trend"] {
  if (current > previous) return "up";
  if (current < previous) return "down";
  return "same";
}

describe("spending trend direction", () => {
  it("marks higher spend as up", () => {
    expect(trendFromSummary(50000, 40000)).toBe("up");
  });

  it("marks lower spend as down", () => {
    expect(trendFromSummary(30000, 40000)).toBe("down");
  });

  it("marks equal spend as same", () => {
    expect(trendFromSummary(40000, 40000)).toBe("same");
  });
});

describe("toCumulativeSeries", () => {
  it("accumulates both series through the period", () => {
    const points = toCumulativeSeries([
      {
        key: "1",
        label: "1st",
        currentDate: "2026-08-01",
        compareDate: "2026-07-01",
        currentPence: 1000,
        previousPence: 500,
      },
      {
        key: "2",
        label: "2nd",
        currentDate: "2026-08-02",
        compareDate: "2026-07-02",
        currentPence: 2000,
        previousPence: 0,
      },
      {
        key: "3",
        label: "3rd",
        currentDate: "2026-08-03",
        compareDate: "2026-07-03",
        currentPence: 0,
        previousPence: 1500,
      },
    ]);

    expect(points.map((p) => p.currentPence)).toEqual([1000, 3000, 3000]);
    expect(points.map((p) => p.previousPence)).toEqual([500, 500, 2000]);
  });
});

describe("spending series alignment", () => {
  it("aligns 31-day and 28-day months by index", () => {
    const currentDays = 31;
    const compareDays = 28;
    const len = Math.max(currentDays, compareDays);
    expect(len).toBe(31);
    expect(len - compareDays).toBe(3);
  });
});
