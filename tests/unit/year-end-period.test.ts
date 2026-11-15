import { describe, expect, it } from "vitest";
import {
  defaultYear,
  inPeriod,
  isStandardYear,
  listYears,
  parsePeriod,
  periodLabel,
  yearContaining,
  yearEndRule,
  type YearEndRule,
} from "@/lib/year-end/period";

const MARCH: YearEndRule = { kind: "month_end", month: 3 };
const TAX_YEAR: YearEndRule = { kind: "fifth_april" };

describe("yearEndRule", () => {
  it("ends a limited company's year on the last day of its year-end month", () => {
    expect(
      yearEndRule({ entityType: "limited_company", financialYearEndMonth: 12, yearEndOnFifthApril: true }),
    ).toEqual({ kind: "month_end", month: 12 });
  });

  it("uses the tax year for a sole trader unless they chose a month end", () => {
    expect(
      yearEndRule({ entityType: "sole_trader", financialYearEndMonth: 3, yearEndOnFifthApril: true }),
    ).toEqual({ kind: "fifth_april" });
    expect(
      yearEndRule({ entityType: "sole_trader", financialYearEndMonth: 12, yearEndOnFifthApril: false }),
    ).toEqual({ kind: "month_end", month: 12 });
  });
});

describe("yearContaining", () => {
  it.each([
    ["2025-04-01", "2025-04-01", "2026-03-31"],
    ["2026-03-31", "2025-04-01", "2026-03-31"],
    ["2025-03-31", "2024-04-01", "2025-03-31"],
    ["2026-04-01", "2026-04-01", "2027-03-31"],
  ])("puts %s in the March year end %s to %s", (date, from, to) => {
    expect(yearContaining(MARCH, date)).toEqual({ from, to });
  });

  it.each([
    ["2025-04-06", "2025-04-06", "2026-04-05"],
    ["2026-04-05", "2025-04-06", "2026-04-05"],
    ["2025-04-05", "2024-04-06", "2025-04-05"],
    ["2026-04-06", "2026-04-06", "2027-04-05"],
  ])("puts %s in the tax year %s to %s", (date, from, to) => {
    expect(yearContaining(TAX_YEAR, date)).toEqual({ from, to });
  });

  it("ends a February year on the 29th in a leap year", () => {
    expect(yearContaining({ kind: "month_end", month: 2 }, "2023-06-01")).toEqual({
      from: "2023-03-01",
      to: "2024-02-29",
    });
  });
});

describe("defaultYear", () => {
  it("is the most recent completed year", () => {
    expect(defaultYear(MARCH, "2026-11-14")).toEqual({ from: "2025-04-01", to: "2026-03-31" });
    expect(defaultYear(TAX_YEAR, "2026-11-14")).toEqual({ from: "2025-04-06", to: "2026-04-05" });
  });

  it("does not offer a year that ends today as completed", () => {
    expect(defaultYear(MARCH, "2026-03-31")).toEqual({ from: "2024-04-01", to: "2025-03-31" });
    expect(defaultYear(MARCH, "2026-04-01")).toEqual({ from: "2025-04-01", to: "2026-03-31" });
  });
});

describe("listYears", () => {
  it("runs from the year in progress back to the year of the earliest record", () => {
    expect(listYears(MARCH, "2023-08-10", "2026-11-14")).toEqual([
      { from: "2026-04-01", to: "2027-03-31" },
      { from: "2025-04-01", to: "2026-03-31" },
      { from: "2024-04-01", to: "2025-03-31" },
      { from: "2023-04-01", to: "2024-03-31" },
    ]);
  });

  it("always includes the most recent completed year, even with no records", () => {
    expect(listYears(TAX_YEAR, null, "2026-11-14")).toEqual([
      { from: "2026-04-06", to: "2027-04-05" },
      { from: "2025-04-06", to: "2026-04-05" },
    ]);
  });
});

describe("periodLabel", () => {
  it("writes both dates in full", () => {
    expect(periodLabel({ from: "2025-04-01", to: "2026-03-31" })).toBe(
      "1 April 2025 to 31 March 2026",
    );
    expect(periodLabel({ from: "2025-04-06", to: "2026-04-05" })).toBe(
      "6 April 2025 to 5 April 2026",
    );
  });
});

describe("isStandardYear", () => {
  it("accepts only an exact standard year", () => {
    expect(isStandardYear(MARCH, { from: "2025-04-01", to: "2026-03-31" })).toBe(true);
    expect(isStandardYear(MARCH, { from: "2025-04-01", to: "2026-06-30" })).toBe(false);
    expect(isStandardYear(MARCH, { from: "2025-04-06", to: "2026-04-05" })).toBe(false);
    expect(isStandardYear(TAX_YEAR, { from: "2025-04-06", to: "2026-04-05" })).toBe(true);
  });
});

describe("parsePeriod", () => {
  it("needs two real dates in order", () => {
    expect(parsePeriod("2025-04-01", "2026-03-31")).toEqual({ from: "2025-04-01", to: "2026-03-31" });
    expect(parsePeriod("2026-03-31", "2025-04-01")).toBeNull();
    expect(parsePeriod("2025-02-30", "2026-03-31")).toBeNull();
    expect(parsePeriod(undefined, "2026-03-31")).toBeNull();
  });
});

describe("inPeriod", () => {
  const period = { from: "2025-04-01", to: "2026-03-31" };
  it.each([
    ["2025-03-31", false],
    ["2025-04-01", true],
    ["2026-03-31", true],
    ["2026-04-01", false],
    [null, false],
  ])("%s → %s", (date, expected) => {
    expect(inPeriod(date, period)).toBe(expected);
  });
});
