import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cutoverImpact,
  cutoverWarnings,
  isBroughtForward,
} from "@/lib/invoices/cutover";

const CUTOVER = "2026-04-01";
const none = { invoices: [], payments: [], credits: [], refunds: [] };

describe("isBroughtForward", () => {
  it("applies only before a set cutover", () => {
    expect(isBroughtForward("2026-03-31", CUTOVER)).toBe(true);
    expect(isBroughtForward(CUTOVER, CUTOVER)).toBe(false);
    expect(isBroughtForward("2026-03-31", null)).toBe(false);
    expect(isBroughtForward(null, CUTOVER)).toBe(false);
  });
});

describe("cutoverImpact", () => {
  it("removes earlier invoices when a cutover is first set", () => {
    const impact = cutoverImpact(null, CUTOVER, {
      ...none,
      invoices: [
        { issueDate: "2026-03-01", netPence: 1000, vatPence: 200 },
        { issueDate: "2026-05-01", netPence: 5000, vatPence: 1000 },
      ],
    });
    expect(impact.invoicesBroughtForward).toBe(1);
    expect(impact.incomeChangePence).toBe(-1000);
    expect(impact.vatChangePence).toBe(-200);
    expect(impact.affectedDates).toEqual(["2026-03-01"]);
  });

  it("restores invoices when the cutover is cleared", () => {
    const impact = cutoverImpact(CUTOVER, null, {
      ...none,
      invoices: [{ issueDate: "2026-03-01", netPence: 1000, vatPence: 200 }],
    });
    expect(impact.invoicesCounted).toBe(1);
    expect(impact.incomeChangePence).toBe(1000);
  });

  it("gives income back when a pre-cutover credit note stops counting", () => {
    const impact = cutoverImpact(null, CUTOVER, {
      ...none,
      credits: [
        {
          invoiceIssueDate: "2026-02-01",
          date: "2026-03-01",
          netPence: 100,
          vatPence: 20,
        },
      ],
    });
    expect(impact.incomeChangePence).toBe(100);
    expect(impact.activityChanged).toBe(1);
  });

  it("leaves activity on or after cutover alone", () => {
    const impact = cutoverImpact(null, CUTOVER, {
      ...none,
      payments: [{ invoiceIssueDate: "2026-02-01", date: CUTOVER }],
      credits: [
        {
          invoiceIssueDate: "2026-02-01",
          date: "2026-05-01",
          netPence: 100,
          vatPence: 20,
        },
      ],
    });
    expect(impact.activityChanged).toBe(0);
    expect(impact.incomeChangePence).toBe(0);
  });

  it("notices payments between the old and new cutover on an invoice staying brought forward", () => {
    const impact = cutoverImpact("2026-03-01", CUTOVER, {
      ...none,
      payments: [{ invoiceIssueDate: "2026-01-01", date: "2026-03-15" }],
    });
    expect(impact.activityChanged).toBe(1);
    expect(impact.affectedDates).toEqual(["2026-03-15"]);
  });
});

describe("cutoverWarnings", () => {
  const base = { cutover: CUTOVER, isLimitedCompany: true };

  it("has none without a cutover", () => {
    expect(
      cutoverWarnings({ ...base, cutover: null, openingBalancesAsAt: null }),
    ).toEqual([]);
  });

  it("warns about reserves when opening balances are missing or misaligned", () => {
    const missing = cutoverWarnings({ ...base, openingBalancesAsAt: null });
    expect(missing.some((w) => w.includes("No opening balances"))).toBe(true);
    const misaligned = cutoverWarnings({
      ...base,
      openingBalancesAsAt: "2025-03-31",
    });
    expect(misaligned.some((w) => w.includes("2025-04-01"))).toBe(true);
  });

  it("has no reserves warning when aligned, or for a sole trader", () => {
    expect(
      cutoverWarnings({ ...base, openingBalancesAsAt: "2026-03-31" }),
    ).toHaveLength(1);
    expect(
      cutoverWarnings({
        cutover: CUTOVER,
        isLimitedCompany: false,
        openingBalancesAsAt: null,
      }),
    ).toHaveLength(1);
  });
});

/**
 * A new report that filters invoices by issue date must decide what happens to
 * brought-forward invoices. Add a file here only if they should count in it.
 */
describe("issue-date filters", () => {
  const EXEMPT = new Set(["src/lib/menu/suggestions.ts"]);

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sourceFiles(path);
      return /\.tsx?$/.test(path) ? [path] : [];
    });
  }

  it("only appear alongside the accounts rules", () => {
    const missing = sourceFiles("src").filter((path) => {
      const text = readFileSync(path, "utf8");
      return (
        /(gte|lte|inPeriod)\(invoices\.issueDate/.test(text) &&
        !text.includes("invoiceCountsInAccounts") &&
        !EXEMPT.has(path)
      );
    });
    expect(missing).toEqual([]);
  });
});
