import { describe, it, expect } from "vitest";
import {
  financialYearEndMonth,
  financialYearStartMonth,
  financialYearStartDate,
  resolveSpendingPeriod,
  resolvePeriod,
  formatPeriodRangeLabel,
  parseIsoDate,
  defaultReportPeriod,
  eachDay,
  ordinalDay,
  ordinalDayFromIso,
  friendlyDayLabel,
} from "@/lib/dates";

describe("financial year month conversion", () => {
  it("derives start month from end month", () => {
    expect(financialYearStartMonth(3)).toBe(4);
    expect(financialYearStartMonth(12)).toBe(1);
  });

  it("derives end month from start month", () => {
    expect(financialYearEndMonth(4)).toBe(3);
    expect(financialYearEndMonth(1)).toBe(12);
  });

  it("round-trips start and end months", () => {
    for (let start = 1; start <= 12; start++) {
      expect(financialYearStartMonth(financialYearEndMonth(start))).toBe(start);
    }
  });
});

describe("financialYearStartDate", () => {
  it("uses April start when FY ends in March", () => {
    expect(financialYearStartDate(3, "2026-08-23")).toBe("2026-04-01");
    expect(financialYearStartDate(3, "2026-02-15")).toBe("2025-04-01");
  });

  it("uses January start when FY ends in December", () => {
    expect(financialYearStartDate(12, "2026-08-23")).toBe("2026-01-01");
    expect(financialYearStartDate(12, "2025-11-01")).toBe("2025-01-01");
  });
});

describe("defaultReportPeriod", () => {
  it("returns current FY start through today", () => {
    const { from, to } = defaultReportPeriod(3);
    expect(from).toMatch(/^\d{4}-04-01$/);
    expect(to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("resolveSpendingPeriod", () => {
  const fyEnd = 3; // March end, April start

  it("defaults current-month to month start through today", () => {
    const p = resolveSpendingPeriod("current-month", fyEnd, "2026-08-23");
    expect(p.from).toBe("2026-08-01");
    expect(p.to).toBe("2026-08-23");
    expect(p.buckets).toBe("day");
  });

  it("compares current-month like-for-like in prior month", () => {
    const p = resolveSpendingPeriod("current-month", fyEnd, "2026-08-23");
    expect(p.compareFrom).toBe("2026-07-01");
    expect(p.compareTo).toBe("2026-07-23");
  });

  it("caps compare day when prior month is shorter", () => {
    const p = resolveSpendingPeriod("current-month", fyEnd, "2026-03-31");
    expect(p.compareFrom).toBe("2026-02-01");
    expect(p.compareTo).toBe("2026-02-28");
  });

  it("resolves last-month as full prior calendar month", () => {
    const p = resolveSpendingPeriod("last-month", fyEnd, "2026-08-23");
    expect(p.from).toBe("2026-07-01");
    expect(p.to).toBe("2026-07-31");
    expect(p.compareFrom).toBe("2026-06-01");
    expect(p.compareTo).toBe("2026-06-30");
  });

  it("resolves last-3-months from two months ago through today", () => {
    const p = resolveSpendingPeriod("last-3-months", fyEnd, "2026-08-23");
    expect(p.from).toBe("2026-06-01");
    expect(p.to).toBe("2026-08-23");
    expect(p.buckets).toBe("month");
    expect(p.label).toBe("June – August 2026");
  });

  it("compares last-3-months like-for-like with prior 3 months", () => {
    const p = resolveSpendingPeriod("last-3-months", fyEnd, "2026-08-23");
    expect(p.compareFrom).toBe("2026-03-01");
    expect(p.compareTo).toBe("2026-05-23");
    expect(p.compareLabel).toBe("Prior 3 months");
  });

  it("resolves current-fy from FY start through today", () => {
    const p = resolveSpendingPeriod("current-fy", fyEnd, "2026-08-23");
    expect(p.from).toBe("2026-04-01");
    expect(p.to).toBe("2026-08-23");
    expect(p.buckets).toBe("month");
  });

  it("compares current-fy with same offset in prior FY", () => {
    const p = resolveSpendingPeriod("current-fy", fyEnd, "2026-08-23");
    expect(p.compareFrom).toBe("2025-04-01");
    expect(p.compareTo).toBe("2025-08-23");
  });

  it("resolves last-fy as the previous full financial year", () => {
    const p = resolveSpendingPeriod("last-fy", fyEnd, "2026-08-23");
    expect(p.from).toBe("2025-04-01");
    expect(p.to).toBe("2026-03-31");
    expect(p.compareFrom).toBe("2024-04-01");
    expect(p.compareTo).toBe("2025-03-31");
  });
});

describe("resolvePeriod custom", () => {
  const fyEnd = 3;

  it("uses provided from and to dates", () => {
    const p = resolvePeriod("custom", fyEnd, {
      from: "2026-01-15",
      to: "2026-02-20",
      today: "2026-08-23",
    });
    expect(p.from).toBe("2026-01-15");
    expect(p.to).toBe("2026-02-20");
    expect(p.label).toBe(formatPeriodRangeLabel("2026-01-15", "2026-02-20"));
    expect(p.buckets).toBe("day");
  });

  it("swaps reversed custom dates", () => {
    const p = resolvePeriod("custom", fyEnd, {
      from: "2026-03-01",
      to: "2026-01-01",
      today: "2026-08-23",
    });
    expect(p.from).toBe("2026-01-01");
    expect(p.to).toBe("2026-03-01");
  });

  it("defaults missing custom dates to current month", () => {
    const p = resolvePeriod("custom", fyEnd, { today: "2026-08-23" });
    expect(p.from).toBe("2026-08-01");
    expect(p.to).toBe("2026-08-23");
  });
});

describe("parseIsoDate", () => {
  it("accepts valid ISO dates and rejects invalid values", () => {
    expect(parseIsoDate("2026-08-23")).toBe("2026-08-23");
    expect(parseIsoDate("2026-02-29")).toBeNull();
    expect(parseIsoDate("not-a-date")).toBeNull();
  });
});

describe("eachDay", () => {
  it("includes both endpoints", () => {
    expect(eachDay("2026-08-01", "2026-08-03")).toEqual([
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
    ]);
  });
});

describe("ordinalDay", () => {
  it("formats ordinal suffixes", () => {
    expect(ordinalDay(1)).toBe("1st");
    expect(ordinalDay(2)).toBe("2nd");
    expect(ordinalDay(3)).toBe("3rd");
    expect(ordinalDay(11)).toBe("11th");
    expect(ordinalDay(23)).toBe("23rd");
    expect(ordinalDayFromIso("2026-08-23")).toBe("23rd");
  });
});

describe("friendlyDayLabel", () => {
  it("uses Today and Yesterday relative to the given day", () => {
    expect(friendlyDayLabel("2026-08-23", "2026-08-23")).toBe("Today");
    expect(friendlyDayLabel("2026-08-22", "2026-08-23")).toBe("Yesterday");
  });

  it("formats older dates in full", () => {
    expect(friendlyDayLabel("2026-08-20", "2026-08-23")).toBe(
      "Thursday, 20 August 2026",
    );
  });
});
