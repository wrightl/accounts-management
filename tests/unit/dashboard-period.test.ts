import { describe, expect, it } from "vitest";
import {
  dashboardChartMonths,
  formatDeltaPercent,
  parseDashboardPeriod,
  pastFinancialYearOptions,
  resolveDashboardPeriod,
  trailingChartMonths,
} from "@/lib/dashboard/period";
import { resolvePeriod } from "@/lib/dates";

describe("parseDashboardPeriod", () => {
  it("defaults to this-month", () => {
    expect(parseDashboardPeriod(undefined)).toBe("this-month");
    expect(parseDashboardPeriod("nope")).toBe("this-month");
  });

  it("accepts known keys", () => {
    expect(parseDashboardPeriod("trailing-12")).toBe("trailing-12");
    expect(parseDashboardPeriod("fy")).toBe("fy");
  });

  it("accepts an earlier financial year only as fy-YYYY", () => {
    expect(parseDashboardPeriod("fy-2024")).toBe("fy-2024");
    expect(parseDashboardPeriod("fy-24")).toBe("this-month");
    expect(parseDashboardPeriod("fy-abcd")).toBe("this-month");
  });
});

describe("formatDeltaPercent", () => {
  it("computes percent change", () => {
    expect(formatDeltaPercent(120, 100)).toEqual({
      percent: 20,
      label: "+20%",
      direction: "up",
    });
    expect(formatDeltaPercent(80, 100)).toEqual({
      percent: -20,
      label: "-20%",
      direction: "down",
    });
  });

  it("handles zero previous", () => {
    expect(formatDeltaPercent(50, 0).direction).toBe("up");
    expect(formatDeltaPercent(0, 0).direction).toBe("flat");
  });
});

describe("resolveDashboardPeriod", () => {
  it("resolves this-month with a prior compare window", () => {
    const period = resolveDashboardPeriod("this-month", 3, "2026-09-19");
    expect(period.from).toBe("2026-09-01");
    expect(period.to).toBe("2026-09-19");
    expect(period.compareFrom).toBe("2026-08-01");
    expect(period.compareTo).toBe("2026-08-19");
  });

  it("resolves trailing-12 as a year window", () => {
    const period = resolveDashboardPeriod("trailing-12", 3, "2026-09-19");
    expect(period.from).toBe("2025-10-01");
    expect(period.to).toBe("2026-09-19");
    expect(period.compareFrom).toBe("2024-10-01");
  });

  it("resolves fy from company year-end month", () => {
    // FY ends March → starts April
    const period = resolveDashboardPeriod("fy", 3, "2026-09-19");
    expect(period.from).toBe("2026-04-01");
    expect(period.to).toBe("2026-09-19");
  });
});

describe("trailingChartMonths", () => {
  it("returns 12 month keys ending today", () => {
    const { months, from, to } = trailingChartMonths(12, "2026-09-19");
    expect(from).toBe("2025-10-01");
    expect(to).toBe("2026-09-19");
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2025-10");
    expect(months[11]).toBe("2026-09");
  });
});

describe("earlier financial years", () => {
  it("resolves fy-YYYY as the whole year against the year before", () => {
    const period = resolveDashboardPeriod("fy-2024", 3, "2026-09-19");
    expect(period.from).toBe("2024-04-01");
    expect(period.to).toBe("2025-03-31");
    expect(period.compareFrom).toBe("2023-04-01");
    expect(period.compareTo).toBe("2024-03-31");
    expect(period.buckets).toBe("month");
    expect(period.label).toBe("FY April 2024 – March 2025");
  });

  it("resolves a December year end as a calendar year", () => {
    const period = resolveDashboardPeriod("fy-2024", 12, "2026-09-19");
    expect(period.from).toBe("2024-01-01");
    expect(period.to).toBe("2024-12-31");
    expect(period.compareFrom).toBe("2023-01-01");
  });

  it("keeps the last-fy spending preset unchanged", () => {
    const period = resolvePeriod("last-fy", 3, { today: "2026-09-19" });
    expect(period).toEqual({
      preset: "last-fy",
      from: "2025-04-01",
      to: "2026-03-31",
      compareFrom: "2024-04-01",
      compareTo: "2025-03-31",
      buckets: "month",
      label: "FY April 2025 – March 2026",
      compareLabel: "Prior FY",
    });
  });

  it("lists finished years newest first, back to the earliest date", () => {
    expect(pastFinancialYearOptions(3, "2023-06-15", "2026-09-19")).toEqual([
      { value: "fy-2025", label: "FY 2025/26" },
      { value: "fy-2024", label: "FY 2024/25" },
      { value: "fy-2023", label: "FY 2023/24" },
    ]);
  });

  it("offers none in the first financial year", () => {
    expect(pastFinancialYearOptions(3, "2026-05-01", "2026-09-19")).toEqual([]);
  });

  it("caps the list and labels December year ends by calendar year", () => {
    const options = pastFinancialYearOptions(12, "2001-01-01", "2026-09-19");
    expect(options).toHaveLength(6);
    expect(options[0]).toEqual({ value: "fy-2025", label: "FY 2025" });
    expect(options[5]!.value).toBe("fy-2020");
  });

  it("charts the chosen year's 12 months", () => {
    const { from, to, months } = dashboardChartMonths("fy-2024", 3, "2026-09-19");
    expect(from).toBe("2024-04-01");
    expect(to).toBe("2025-03-31");
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2024-04");
    expect(months[11]).toBe("2025-03");
  });

  it("charts the trailing 12 months otherwise", () => {
    expect(dashboardChartMonths("fy", 3, "2026-09-19")).toEqual(
      trailingChartMonths(12, "2026-09-19"),
    );
  });
});
