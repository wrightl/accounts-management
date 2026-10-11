import { describe, expect, it } from "vitest";
import {
  applyWhatIfs,
  buildForecast,
  monthlyToWeekly,
  weekStart,
  type ForecastEvent,
} from "@/lib/forecast/engine";

const START = "2026-10-05"; // a Monday

const events: ForecastEvent[] = [
  { date: "2026-09-20", amountPence: 10_000, kind: "invoice", label: "Old", clientId: "b", overdue: true },
  { date: "2026-10-14", amountPence: 50_000, kind: "invoice", label: "INV-1", clientId: "a" },
  { date: "2026-10-21", amountPence: -200_000, kind: "vat", label: "VAT" },
  { date: "2027-06-01", amountPence: 999_999, kind: "invoice", label: "Too far", clientId: "a" },
];

describe("weekStart", () => {
  it("finds the Monday", () => {
    expect(weekStart("2026-10-11")).toBe("2026-10-05");
    expect(weekStart("2026-10-12")).toBe("2026-10-12");
    expect(weekStart("2026-10-07")).toBe("2026-10-05");
  });
});

describe("buildForecast", () => {
  const forecast = buildForecast({
    openingCashPence: 100_000,
    firstWeekStart: START,
    events,
    weeklySpendPence: 10_000,
    lowCashPence: 50_000,
  });

  it("rolls cash forward week by week", () => {
    expect(forecast.weeks).toHaveLength(13);
    // Overdue money lands in the first week.
    expect(forecast.weeks[0]).toMatchObject({ inPence: 10_000, outPence: 10_000, closingPence: 100_000 });
    expect(forecast.weeks[1]!.closingPence).toBe(140_000);
    expect(forecast.weeks[2]).toMatchObject({ outPence: 210_000, closingPence: -70_000 });
    expect(forecast.weeks[12]!.closingPence).toBe(-70_000 - 10 * 10_000);
  });

  it("flags the first week below the low-cash line and below zero", () => {
    expect(forecast.firstBelowLow?.start).toBe("2026-10-19");
    expect(forecast.firstNegative?.start).toBe("2026-10-19");
    expect(forecast.lowest.index).toBe(12);
  });
});

describe("applyWhatIfs", () => {
  it("pushes one client's payments back", () => {
    const moved = applyWhatIfs(events, { lateClientId: "a", lateWeeks: 4 }, START);
    expect(moved.find((e) => e.label === "INV-1")!.date).toBe("2026-11-11");
    expect(moved.find((e) => e.label === "VAT")!.date).toBe("2026-10-21");
  });

  it("can leave out overdue invoices", () => {
    expect(applyWhatIfs(events, { excludeOverdue: true }, START).map((e) => e.label)).not.toContain("Old");
  });

  it("adds a new hire's cost from the week they start", () => {
    const withHire = applyWhatIfs(
      events,
      { hireMonthlyCostPence: 520_000, hireStartDate: "2026-12-30" },
      START,
    );
    const hire = withHire.filter((e) => e.kind === "hire");
    expect(hire[0]).toMatchObject({ date: "2026-12-28", amountPence: -monthlyToWeekly(520_000) });
    expect(hire).toHaveLength(1);
    expect(monthlyToWeekly(520_000)).toBe(120_000);
  });
});
