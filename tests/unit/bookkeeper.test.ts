import { describe, expect, it } from "vitest";
import { learnCategories, payeeKey, suggestFromHistory } from "@/lib/bookkeeper/learn";
import { explainMatch } from "@/lib/bookkeeper/explain";

describe("payeeKey", () => {
  it("ignores card numbers, references and punctuation", () => {
    expect(payeeKey("ADOBE *CREATIVE 4412")).toBe("adobe creative");
    expect(payeeKey("Adobe Creative Cloud")).toBe("adobe creative");
    expect(payeeKey("123 456")).toBeNull();
  });
});

describe("learning from history", () => {
  const learned = learnCategories([
    { counterparty: "ADOBE *CREATIVE 1", spendingCategory: "SOFTWARE_AND_SUBSCRIPTIONS" },
    { counterparty: "Adobe Creative 2", spendingCategory: "SOFTWARE_AND_SUBSCRIPTIONS" },
    { counterparty: "Adobe Creative 3", spendingCategory: "SOFTWARE_AND_SUBSCRIPTIONS" },
    { counterparty: "Tesco Stores", spendingCategory: "FOOD_AND_DRINK" },
    { counterparty: "Tesco Stores", spendingCategory: "WORKPLACE" },
  ]);

  it("suggests the category a payee is consistently given", () => {
    expect(suggestFromHistory("ADOBE CREATIVE 99", learned)).toEqual({
      category: "SOFTWARE_AND_SUBSCRIPTIONS",
      reason: "You put 3 earlier payments to ADOBE CREATIVE 99 in Software and subscriptions.",
    });
  });

  it("stays quiet when past choices disagree", () => {
    expect(suggestFromHistory("TESCO STORES 3", learned)).toBeNull();
    expect(suggestFromHistory("Brand new payee", learned)).toBeNull();
  });
});

describe("explainMatch", () => {
  const breakdown = {
    dateScore: 96,
    invoiceRefScore: 100,
    paymentRefScore: 0,
    counterpartyScore: 85,
    total: 0,
  };

  it("describes an invoice payment in one line", () => {
    expect(explainMatch({ matchType: "invoice_payment", breakdown, note: null })).toBe(
      "Exact amount, dated within 2 days of the invoice, the reference quotes the invoice number and the payer's name matches the client.",
    );
  });

  it("describes a receipt matched on the same day", () => {
    expect(
      explainMatch({
        matchType: "expense",
        breakdown: { ...breakdown, dateScore: 100, invoiceRefScore: 0, counterpartyScore: 0 },
        note: null,
      }),
    ).toBe("Exact amount, dated the same day as the receipt.");
  });

  it("uses the AI's own reason for AI matches", () => {
    expect(
      explainMatch({ matchType: "expense", breakdown, note: "AI: Pret A Manger is the café on the receipt." }),
    ).toBe("Pret A Manger is the café on the receipt.");
  });
});
