import { describe, expect, it } from "vitest";
import {
  addMonths,
  estimateCorporationTax,
  splitByTaxYear,
} from "@/lib/ledger/corporation-tax";
import { buildReservesSchedule } from "@/lib/ledger/reserves";
import { directorLoanWarnings } from "@/lib/ledger/director-loan";

const YEAR = { periodStart: "2025-04-01", periodEnd: "2026-03-31" };

describe("estimateCorporationTax", () => {
  it("charges 19% up to £50,000", () => {
    const t = estimateCorporationTax({ taxableProfitPence: 4_000_000, ...YEAR });
    expect(t.taxPence).toBe(760_000);
    expect(t.band).toBe("small");
  });

  it("applies marginal relief between £50,000 and £250,000", () => {
    // 25% × £100,000 − 3/200 × (£250,000 − £100,000) = £22,750
    const t = estimateCorporationTax({ taxableProfitPence: 10_000_000, ...YEAR });
    expect(t.taxPence).toBe(2_275_000);
    expect(t.band).toBe("marginal");
  });

  it("charges 25% from £250,000", () => {
    const t = estimateCorporationTax({ taxableProfitPence: 30_000_000, ...YEAR });
    expect(t.taxPence).toBe(7_500_000);
    expect(t.band).toBe("main");
  });

  it("shares the limits with associated companies", () => {
    // Limits halve to £25,000 and £125,000: 25% × £40,000 − 3/200 × £85,000
    const t = estimateCorporationTax({
      taxableProfitPence: 4_000_000,
      ...YEAR,
      associatedCompanies: 1,
    });
    expect(t.taxPence).toBe(872_500);
  });

  it("scales the limits for a short period", () => {
    // Six months: limits £25,000 and £125,000 (183/365 of a year).
    const t = estimateCorporationTax({
      taxableProfitPence: 2_000_000,
      periodStart: "2025-04-01",
      periodEnd: "2025-09-30",
    });
    expect(t.band).toBe("small");
    const over = estimateCorporationTax({
      taxableProfitPence: 4_000_000,
      periodStart: "2025-04-01",
      periodEnd: "2025-09-30",
    });
    expect(over.band).toBe("marginal");
  });

  it("splits a period that straddles 1 April 2023", () => {
    // 90 days at the flat 19%, 275 days at the main rate.
    const t = estimateCorporationTax({
      taxableProfitPence: 36_500_000,
      periodStart: "2023-01-01",
      periodEnd: "2023-12-31",
    });
    expect(t.taxPence).toBe(1_710_000 + 6_875_000);
  });

  it("charges nothing on a loss", () => {
    expect(estimateCorporationTax({ taxableProfitPence: -500, ...YEAR }).taxPence).toBe(0);
  });
});

describe("date helpers", () => {
  it("splits at each 1 April", () => {
    expect(splitByTaxYear("2024-01-01", "2024-12-31")).toEqual([
      { from: "2024-01-01", to: "2024-03-31" },
      { from: "2024-04-01", to: "2024-12-31" },
    ]);
  });

  it("clamps to the end of the month", () => {
    expect(addMonths("2025-03-31", 9)).toBe("2025-12-31");
    expect(addMonths("2024-05-31", 9)).toBe("2025-02-28");
  });
});

describe("buildReservesSchedule", () => {
  it("carries losses forward and takes off tax and dividends", () => {
    const [y1, y2] = buildReservesSchedule({
      openingReservesPence: 500_000,
      years: [
        { start: "2024-04-01", end: "2025-03-31", profitPence: -1_000_000, dividendsPence: 0, current: false },
        { start: "2025-04-01", end: "2026-03-31", profitPence: 3_000_000, dividendsPence: 200_000, current: true },
      ],
    });
    expect(y1!.closingReservesPence).toBe(-500_000);
    expect(y1!.lossesCarriedForwardPence).toBe(1_000_000);
    expect(y2!.lossesUsedPence).toBe(1_000_000);
    expect(y2!.taxablePence).toBe(2_000_000);
    expect(y2!.tax.taxPence).toBe(380_000);
    // −£5,000 + £30,000 − £3,800 tax − £2,000 dividends
    expect(y2!.closingReservesPence).toBe(1_920_000);
  });
});

describe("directorLoanWarnings", () => {
  const base = {
    lastYearEnd: "2026-03-31",
    currentYearEnd: "2027-03-31",
    today: "2026-10-11",
  };

  it("warns about s455 on a balance still owed from the last year end", () => {
    const warnings = directorLoanWarnings({
      ...base,
      balanceAtLastYearEndPence: -800_000,
      balancePence: -300_000,
    });
    expect(warnings[0]).toEqual({
      kind: "s455_due",
      yearEnd: "2026-03-31",
      repayBy: "2026-12-31",
      outstandingPence: 300_000,
      taxPence: 101_250,
    });
    expect(warnings[1]!.kind).toBe("overdrawn");
  });

  it("stops warning once repaid or past the deadline", () => {
    expect(
      directorLoanWarnings({ ...base, balanceAtLastYearEndPence: -800_000, balancePence: 0 }),
    ).toEqual([]);
    expect(
      directorLoanWarnings({
        ...base,
        today: "2027-01-05",
        balanceAtLastYearEndPence: -800_000,
        balancePence: 0,
      }),
    ).toEqual([]);
  });

  it("flags a benefit in kind over £10,000", () => {
    const kinds = directorLoanWarnings({
      ...base,
      balanceAtLastYearEndPence: 0,
      balancePence: -1_200_000,
    }).map((w) => w.kind);
    expect(kinds).toEqual(["overdrawn", "benefit_in_kind"]);
  });
});
