import { describe, expect, it } from "vitest";
import { isDateLocked, periodLockError } from "@/lib/period-lock";

describe("period lock", () => {
  it("locks dates on or before the lock date", () => {
    expect(isDateLocked("2026-03-31", "2026-03-31")).toBe(true);
    expect(isDateLocked("2026-03-01", "2026-03-31")).toBe(true);
    expect(isDateLocked("2026-04-01", "2026-03-31")).toBe(false);
  });

  it("treats no lock or no date as open", () => {
    expect(isDateLocked("2020-01-01", null)).toBe(false);
    expect(isDateLocked(null, "2026-03-31")).toBe(false);
  });

  it("uses the London calendar day for timestamps", () => {
    // 23:30 UTC on 31 March 2026 is 00:30 BST on 1 April.
    expect(isDateLocked(new Date("2026-03-31T23:30:00Z"), "2026-03-31")).toBe(false);
    expect(isDateLocked(new Date("2026-03-31T22:30:00Z"), "2026-03-31")).toBe(true);
  });

  it("reports an error if any of the dates is locked", () => {
    expect(periodLockError("2026-03-31", "2026-04-02", "2026-03-30")).toMatch(
      /locked up to 31\/03\/2026/,
    );
    expect(periodLockError("2026-03-31", "2026-04-02", null)).toBeNull();
  });
});
