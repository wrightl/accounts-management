import { describe, expect, it } from "vitest";
import { computeSafeToPay, vatDueDate, vatQuarterFor } from "@/lib/safe-to-pay/calc";

describe("vatQuarterFor", () => {
  it("finds the quarter for each stagger", () => {
    expect(vatQuarterFor("2026-10-11", 3)).toEqual({ start: "2026-10-01", end: "2026-12-31" });
    expect(vatQuarterFor("2026-10-11", 1)).toEqual({ start: "2026-08-01", end: "2026-10-31" });
    expect(vatQuarterFor("2026-10-11", 2)).toEqual({ start: "2026-09-01", end: "2026-11-30" });
  });

  it("crosses the year end", () => {
    expect(vatQuarterFor("2026-12-15", 1)).toEqual({ start: "2026-11-01", end: "2027-01-31" });
    expect(vatQuarterFor("2027-01-10", 2)).toEqual({ start: "2026-12-01", end: "2027-02-28" });
  });
});

describe("vatDueDate", () => {
  it("is one month and seven days after the quarter end", () => {
    expect(vatDueDate("2026-09-30")).toBe("2026-11-07");
    expect(vatDueDate("2026-12-31")).toBe("2027-02-07");
    expect(vatDueDate("2027-01-31")).toBe("2027-03-07");
  });
});

describe("computeSafeToPay", () => {
  const base = {
    cashPence: 5_000_000,
    vatOwedPence: 200_000,
    corporationTaxPence: 300_000,
    billsDuePence: 50_000,
    bufferPence: 450_000,
    reservesPence: 6_000_000,
    expectedInPence: 1_000_000,
  };

  it("takes everything owed and the buffer off cash", () => {
    const r = computeSafeToPay(base);
    expect(r.freeCashPence).toBe(4_000_000);
    expect(r.safeNowPence).toBe(4_000_000);
    expect(r.limitedBy).toBe("cash");
    expect(r.safeLaterPence).toBe(5_000_000);
  });

  it("caps at distributable reserves", () => {
    const r = computeSafeToPay({ ...base, reservesPence: 1_500_000 });
    expect(r.safeNowPence).toBe(1_500_000);
    expect(r.limitedBy).toBe("reserves");
    expect(r.safeLaterPence).toBe(1_500_000);
  });

  it("never goes below zero", () => {
    const r = computeSafeToPay({ ...base, cashPence: 100_000, reservesPence: -5 });
    expect(r.safeNowPence).toBe(0);
    expect(r.freeCashPence).toBeLessThan(0);
  });
});
