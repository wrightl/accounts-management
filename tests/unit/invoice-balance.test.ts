import { describe, expect, it, vi } from "vitest";
import {
  invoiceAmountDue,
  invoiceBalance,
  invoiceRefundDue,
  isInvoiceSettled,
  settlementMinor,
  settlementPence,
} from "@/lib/invoices/balance";
import { subtractByMonth } from "@/lib/credit-notes/period";

vi.mock("server-only", () => ({}));

describe("invoice balance with credit notes", () => {
  it("matches gross less payments when there are no credits", () => {
    const s = { gross: 120000, paid: 20000 };
    expect(invoiceBalance(s)).toBe(100000);
    expect(invoiceAmountDue(s)).toBe(100000);
    expect(invoiceRefundDue(s)).toBe(0);
    expect(isInvoiceSettled(s)).toBe(false);
  });

  it("reduces the amount due by a credit on an unpaid invoice", () => {
    const s = { gross: 120000, paid: 0, credited: 30000 };
    expect(invoiceAmountDue(s)).toBe(90000);
    expect(invoiceRefundDue(s)).toBe(0);
  });

  it("settles an invoice that is fully credited", () => {
    const s = { gross: 120000, paid: 0, credited: 120000 };
    expect(invoiceAmountDue(s)).toBe(0);
    expect(isInvoiceSettled(s)).toBe(true);
  });

  it("turns a credit on a paid invoice into a refund due, cleared by the refund", () => {
    const owed = { gross: 120000, paid: 120000, credited: 30000 };
    expect(invoiceAmountDue(owed)).toBe(0);
    expect(invoiceRefundDue(owed)).toBe(30000);
    expect(isInvoiceSettled(owed)).toBe(true);

    const refunded = { ...owed, refunded: 30000 };
    expect(invoiceBalance(refunded)).toBe(0);
    expect(invoiceRefundDue(refunded)).toBe(0);
  });

  it("never treats a zero-value invoice as settled", () => {
    expect(isInvoiceSettled({ gross: 0, paid: 0 })).toBe(false);
  });
});

describe("settlement units", () => {
  const usd = { grossMinor: 7000, grossPence: 5500 };

  it("settles a foreign invoice in its own currency", () => {
    // $70 paid in full; it reached the bank as £54.20.
    const minor = settlementMinor(usd, 7000);
    expect(invoiceAmountDue(minor)).toBe(0);
    expect(isInvoiceSettled(minor)).toBe(true);

    // In sterling the books still show the 80p the exchange rate cost.
    expect(invoiceBalance(settlementPence(usd, 5420))).toBe(80);
  });

  it("uses each unit's credits and write-offs", () => {
    const adj = {
      creditedMinor: 1000,
      creditedPence: 786,
      refundedMinor: 0,
      refundedPence: 0,
      writtenOffMinor: 0,
      writtenOffPence: 80,
    };
    expect(invoiceAmountDue(settlementMinor(usd, 6000, adj))).toBe(0);
    expect(invoiceBalance(settlementPence(usd, 4634, adj))).toBe(0);
  });
});

describe("subtractByMonth", () => {
  it("subtracts credits per month and adds credit-only months in order", () => {
    expect(
      subtractByMonth(
        [
          { month: "2026-01", totalPence: 1000 },
          { month: "2026-03", totalPence: 500 },
        ],
        new Map([
          ["2026-03", 200],
          ["2026-02", 300],
        ]),
      ),
    ).toEqual([
      { month: "2026-01", totalPence: 1000 },
      { month: "2026-02", totalPence: -300 },
      { month: "2026-03", totalPence: 300 },
    ]);
  });
});
