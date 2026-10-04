import { describe, expect, it } from "vitest";
import {
  easterSunday,
  englandWalesBankHolidays,
  isEnglandWalesWorkingDay,
  withinWorkingDayWindow,
  workingDayDistance,
} from "@/lib/bank/working-days";

describe("England & Wales working days", () => {
  it("treats weekends as non-working", () => {
    expect(isEnglandWalesWorkingDay("2026-04-10")).toBe(true); // Fri
    expect(isEnglandWalesWorkingDay("2026-04-11")).toBe(false); // Sat
    expect(isEnglandWalesWorkingDay("2026-04-12")).toBe(false); // Sun
    expect(isEnglandWalesWorkingDay("2026-04-13")).toBe(true); // Mon
  });

  it("treats Easter 2026 bank holidays as non-working", () => {
    expect(easterSunday(2026)).toBe("2026-04-05");
    const holidays = englandWalesBankHolidays(2026);
    expect(holidays.has("2026-04-03")).toBe(true); // Good Friday
    expect(holidays.has("2026-04-06")).toBe(true); // Easter Monday
    expect(isEnglandWalesWorkingDay("2026-04-03")).toBe(false);
    expect(isEnglandWalesWorkingDay("2026-04-06")).toBe(false);
  });

  it("counts working-day distance across a weekend", () => {
    // Fri → Mon is 1 working day
    expect(workingDayDistance("2026-04-10", "2026-04-13")).toBe(1);
    expect(withinWorkingDayWindow("2026-04-10", "2026-04-13", 3)).toBe(true);
  });

  it("counts working-day distance across Easter", () => {
    // Thu 2 Apr → Tue 7 Apr: Fri/Mon holidays, so working days = Tue only → 1
    expect(workingDayDistance("2026-04-02", "2026-04-07")).toBe(1);
    expect(withinWorkingDayWindow("2026-04-02", "2026-04-07", 3)).toBe(true);
  });

  it("rejects gaps beyond three working days", () => {
    // Mon 13 → Fri 17 = 4 working days
    expect(workingDayDistance("2026-04-13", "2026-04-17")).toBe(4);
    expect(withinWorkingDayWindow("2026-04-13", "2026-04-17", 3)).toBe(false);
  });
});
