import { describe, it, expect } from "vitest";
import {
  pickBestBankTxForInvoice,
  pickBestMatch,
  scoreBankTxForInvoice,
  scoreMatch,
} from "@/lib/bank/match";

const tx = {
  amountPence: 25000,
  bookedAt: "2026-04-02",
  reference: "DD-2026-0001 lunch",
  description: null,
  counterparty: "Acme Ltd",
};

describe("bank match scorer", () => {
  it("rejects amount mismatches", () => {
    expect(
      scoreMatch(tx, { id: "a", amountPence: 24999, date: "2026-04-02" }),
    ).toBe(0);
  });

  it("rejects dates outside the 90-day window", () => {
    expect(
      scoreMatch(tx, { id: "a", amountPence: 25000, date: "2026-01-01" }),
    ).toBe(0);
  });

  it("still scores matches several weeks from the invoice date", () => {
    const withClient = {
      id: "hit",
      amountPence: 25000,
      date: "2026-03-01",
      clientName: "Jane Smith",
      companyName: "Acme Ltd",
    };
    expect(scoreMatch(tx, withClient)).toBeGreaterThanOrEqual(70);
  });

  it("prefers an invoice number found in the bank reference", () => {
    const withNumber = {
      id: "hit",
      amountPence: 25000,
      date: "2026-04-01",
      invoiceNumber: "DD-2026-0001",
      clientName: "Jane",
      companyName: "Acme Ltd",
    };
    const sameAmount = {
      id: "miss",
      amountPence: 25000,
      date: "2026-04-02",
    };
    expect(scoreMatch(tx, withNumber)).toBeGreaterThan(scoreMatch(tx, sameAmount));
    expect(pickBestMatch(tx, [sameAmount, withNumber])?.candidate.id).toBe("hit");
  });

  it("boosts counterparty similarity against client company", () => {
    const withClient = {
      id: "hit",
      amountPence: 25000,
      date: "2026-04-02",
      clientName: "Jane Smith",
      companyName: "Acme Ltd",
    };
    const withoutClient = {
      id: "miss",
      amountPence: 25000,
      date: "2026-04-02",
    };
    expect(scoreMatch(tx, withClient)).toBeGreaterThan(scoreMatch(tx, withoutClient));
  });
});

describe("scoreBankTxForInvoice", () => {
  const invoice = {
    id: "inv-1",
    number: "DD-2026-0001",
    name: "Jane Smith",
    companyName: "Acme Ltd",
    balancePence: 25000,
    dueDate: "2026-04-10",
  };

  it("scores matching incoming transaction", () => {
    const breakdown = scoreBankTxForInvoice(tx, invoice, "2026-04-02");
    expect(breakdown.total).toBeGreaterThanOrEqual(70);
    expect(breakdown.invoiceRefScore).toBeGreaterThanOrEqual(80);
    expect(breakdown.counterpartyScore).toBeGreaterThanOrEqual(80);
  });

  it("rejects outgoing transactions", () => {
    const outgoing = { ...tx, amountPence: -25000 };
    expect(scoreBankTxForInvoice(outgoing, invoice, "2026-04-02").total).toBe(0);
  });

  it("picks best bank tx for invoice", () => {
    const worse = {
      amountPence: 25000,
      bookedAt: "2026-04-02",
      reference: "misc",
      description: null,
      counterparty: "Unknown",
    };
    const result = pickBestBankTxForInvoice([worse, tx], invoice, "2026-04-02");
    expect(result?.tx.reference).toBe("DD-2026-0001 lunch");
  });
});
