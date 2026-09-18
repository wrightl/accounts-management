import { describe, it, expect } from "vitest";
import {
  computeNextRunOn,
  isRecurringExhausted,
  shouldDisableAfterGenerate,
} from "@/lib/invoices/recurring";

describe("computeNextRunOn", () => {
  it("returns this month when today is on or before the day and not yet generated", () => {
    expect(computeNextRunOn(15, "2026-03-10", null)).toBe("2026-03-15");
    expect(computeNextRunOn(15, "2026-03-15", null)).toBe("2026-03-15");
  });

  it("advances to next month when today is after the day", () => {
    expect(computeNextRunOn(15, "2026-03-16", null)).toBe("2026-04-15");
  });

  it("advances to next month when already generated this month", () => {
    expect(
      computeNextRunOn(15, "2026-03-10", new Date("2026-03-01T12:00:00Z")),
    ).toBe("2026-04-15");
  });

  it("rolls year at December", () => {
    expect(computeNextRunOn(1, "2026-12-15", null)).toBe("2027-01-01");
  });
});

describe("isRecurringExhausted", () => {
  it("stops when endsOn is before today", () => {
    expect(
      isRecurringExhausted({
        today: "2026-03-15",
        endsOn: "2026-03-01",
        maxOccurrences: null,
        occurrenceCount: 0,
      }),
    ).toBe(true);
  });

  it("stops when occurrence count reaches max", () => {
    expect(
      isRecurringExhausted({
        today: "2026-03-15",
        endsOn: null,
        maxOccurrences: 3,
        occurrenceCount: 3,
      }),
    ).toBe(true);
  });

  it("allows generation when within limits", () => {
    expect(
      isRecurringExhausted({
        today: "2026-03-15",
        endsOn: "2026-12-31",
        maxOccurrences: 12,
        occurrenceCount: 2,
      }),
    ).toBe(false);
  });
});

describe("shouldDisableAfterGenerate", () => {
  it("disables when max occurrences reached", () => {
    expect(
      shouldDisableAfterGenerate({
        nextRunOn: "2026-04-15",
        endsOn: null,
        maxOccurrences: 1,
        occurrenceCount: 1,
      }),
    ).toBe(true);
  });

  it("disables when next run is after endsOn", () => {
    expect(
      shouldDisableAfterGenerate({
        nextRunOn: "2026-04-15",
        endsOn: "2026-03-31",
        maxOccurrences: null,
        occurrenceCount: 1,
      }),
    ).toBe(true);
  });
});
