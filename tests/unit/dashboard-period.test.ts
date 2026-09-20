import { describe, expect, it } from "vitest";
import {
  formatDeltaPercent,
  parseDashboardPeriod,
  resolveDashboardPeriod,
  trailingChartMonths,
} from "@/lib/dashboard/period";

describe("parseDashboardPeriod", () => {
  it("defaults to this-month", () => {
    expect(parseDashboardPeriod(undefined)).toBe("this-month");
    expect(parseDashboardPeriod("nope")).toBe("this-month");
  });

  it("accepts known keys", () => {
    expect(parseDashboardPeriod("trailing-12")).toBe("trailing-12");
    expect(parseDashboardPeriod("fy")).toBe("fy");
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
