import { describe, expect, it } from "vitest";
import {
  fixedCompensationPence,
  latePaymentCharge,
  referenceBaseRate,
} from "@/lib/late-payment";
import { dueReminderStep, normaliseSchedule } from "@/lib/reminders/schedule";
import { isMonday } from "@/lib/dates";

describe("referenceBaseRate", () => {
  it("uses the rate on the 30 June or 31 December before the debt became overdue", () => {
    // Due 30 June 2025: overdue from 1 July, so the 30 June 2025 rate.
    expect(referenceBaseRate("2025-06-30").basePercent).toBe(4.25);
    // Due 29 June 2025: overdue from 30 June, still the 31 December 2024 rate.
    expect(referenceBaseRate("2025-06-29").basePercent).toBe(4.75);
    expect(referenceBaseRate("2026-08-01")).toEqual({ basePercent: 3.75, known: true });
  });

  it("falls back to the latest rate, flagged, beyond the table", () => {
    expect(referenceBaseRate("2027-02-01")).toEqual({ basePercent: 3.75, known: false });
  });
});

describe("latePaymentCharge", () => {
  it("charges simple daily interest at 8% over base, plus fixed compensation", () => {
    const charge = latePaymentCharge({
      amountDuePence: 500_000,
      dueDate: "2026-08-31",
      asOf: "2026-09-30",
    })!;
    expect(charge.daysLate).toBe(30);
    expect(charge.ratePercent).toBe(11.75);
    // £5,000 × 11.75% × 30 / 365
    expect(charge.interestPence).toBe(4_829);
    expect(charge.compensationPence).toBe(7_000);
    expect(charge.totalPence).toBe(11_829);
  });

  it("is nothing until the debt is late", () => {
    expect(latePaymentCharge({ amountDuePence: 1000, dueDate: "2026-09-30", asOf: "2026-09-30" }))
      .toBeNull();
  });

  it("bands compensation by the size of the debt", () => {
    expect(fixedCompensationPence(99_999)).toBe(4_000);
    expect(fixedCompensationPence(100_000)).toBe(7_000);
    expect(fixedCompensationPence(1_000_000)).toBe(10_000);
  });
});

describe("dueReminderStep", () => {
  const schedule = [-3, 1, 7, 14];
  const base = { schedule, dueDate: "2026-10-20", issueDate: "2026-10-01" };

  it("returns the latest step reached", () => {
    expect(dueReminderStep({ ...base, today: "2026-10-16" })).toBeNull();
    expect(dueReminderStep({ ...base, today: "2026-10-17" })).toBe(-3);
    expect(dueReminderStep({ ...base, today: "2026-10-20" })).toBeNull();
    expect(dueReminderStep({ ...base, today: "2026-10-21" })).toBe(1);
    expect(dueReminderStep({ ...base, today: "2026-11-30" })).toBe(14);
  });

  it("skips a before-due reminder for an invoice issued after that point", () => {
    expect(
      dueReminderStep({ ...base, issueDate: "2026-10-18", today: "2026-10-19" }),
    ).toBeNull();
  });

  it("keeps only offered steps, sorted", () => {
    expect(normaliseSchedule([14, 1, 1, -3, 99])).toEqual([-3, 1, 14]);
  });
});

describe("isMonday", () => {
  it("checks the calendar day", () => {
    expect(isMonday("2026-10-12")).toBe(true);
    expect(isMonday("2026-10-11")).toBe(false);
  });
});
