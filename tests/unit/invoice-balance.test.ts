import { describe, expect, it, vi } from "vitest";
import {
  invoiceAmountDuePence,
  invoiceBalancePence,
  invoiceRefundDuePence,
  isInvoiceSettled,
} from "@/lib/invoices/balance";
import { subtractByMonth } from "@/lib/credit-notes/period";

vi.mock("server-only", () => ({}));

describe("invoice balance with credit notes", () => {
  it("matches gross less payments when there are no credits", () => {
    const s = { grossPence: 120000, paidPence: 20000 };
    expect(invoiceBalancePence(s)).toBe(100000);
    expect(invoiceAmountDuePence(s)).toBe(100000);
    expect(invoiceRefundDuePence(s)).toBe(0);
    expect(isInvoiceSettled(s)).toBe(false);
  });

  it("reduces the amount due by a credit on an unpaid invoice", () => {
    const s = { grossPence: 120000, paidPence: 0, creditedPence: 30000 };
    expect(invoiceAmountDuePence(s)).toBe(90000);
    expect(invoiceRefundDuePence(s)).toBe(0);
  });

  it("settles an invoice that is fully credited", () => {
    const s = { grossPence: 120000, paidPence: 0, creditedPence: 120000 };
    expect(invoiceAmountDuePence(s)).toBe(0);
    expect(isInvoiceSettled(s)).toBe(true);
  });

  it("turns a credit on a paid invoice into a refund due, cleared by the refund", () => {
    const owed = { grossPence: 120000, paidPence: 120000, creditedPence: 30000 };
    expect(invoiceAmountDuePence(owed)).toBe(0);
    expect(invoiceRefundDuePence(owed)).toBe(30000);
    expect(isInvoiceSettled(owed)).toBe(true);

    const refunded = { ...owed, refundedPence: 30000 };
    expect(invoiceBalancePence(refunded)).toBe(0);
    expect(invoiceRefundDuePence(refunded)).toBe(0);
  });

  it("never treats a zero-value invoice as settled", () => {
    expect(isInvoiceSettled({ grossPence: 0, paidPence: 0 })).toBe(false);
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
