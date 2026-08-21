import { describe, it, expect } from "vitest";
import {
  formatInvoiceNumber,
  nextInvoiceNumber,
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

  it("continues the sequence within the same year", () => {
    const result = nextInvoiceNumber(
      { invoiceNumberPrefix: "DD", invoiceNextSeq: 3, invoiceSeqYear: 2026 },
      2026,
    );
    expect(result.number).toBe("DD-2026-0003");
    expect(result.nextSeq).toBe(4);
    expect(result.seqYear).toBe(2026);
  });

  it("resets the sequence when the year changes", () => {
    const result = nextInvoiceNumber(
      { invoiceNumberPrefix: "DD", invoiceNextSeq: 12, invoiceSeqYear: 2025 },
      2026,
    );
    expect(result.number).toBe("DD-2026-0001");
    expect(result.nextSeq).toBe(2);
    expect(result.seqYear).toBe(2026);
  });

  it("starts at 1 when seq year is unset", () => {
    const result = nextInvoiceNumber(
      { invoiceNumberPrefix: "ACME", invoiceNextSeq: 99, invoiceSeqYear: null },
      2026,
    );
    expect(result.number).toBe("ACME-2026-0001");
  });
});
