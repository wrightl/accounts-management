import { describe, it, expect } from "vitest";
import {
  formatInvoiceNumber,
  highestSeqByYear,
  parseIssueYear,
} from "@/lib/invoices/numbering";

describe("invoice numbering", () => {
  it("formats prefix-year-seq", () => {
    expect(formatInvoiceNumber("DD", 2026, 1)).toBe("DD-2026-0001");
    expect(formatInvoiceNumber("DD", 2026, 42)).toBe("DD-2026-0042");
  });

  it("parses year from ISO date strings", () => {
    expect(parseIssueYear("2026-03-15")).toBe(2026);
    expect(parseIssueYear(null)).toBe(new Date().getFullYear());
  });
});

describe("highestSeqByYear", () => {
  it("finds the highest sequence for each year", () => {
    const highest = highestSeqByYear("DD", [
      "DD-2026-0005",
      "DD-2026-0002",
      "dd-2025-0099",
    ]);
    expect([...highest]).toEqual([
      [2026, 5],
      [2025, 99],
    ]);
  });

  it("ignores other formats and prefixes", () => {
    expect(
      highestSeqByYear("DD", ["OTHER-1", "INV-0043", "XX-2026-0009"]).size,
    ).toBe(0);
  });

  it("treats the prefix literally", () => {
    expect(highestSeqByYear("A.B", ["AxB-2026-0001"]).size).toBe(0);
    expect(highestSeqByYear("A.B", ["A.B-2026-0001"]).get(2026)).toBe(1);
  });
});
