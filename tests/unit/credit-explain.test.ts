import { describe, expect, it } from "vitest";
import {
  creditExplainLabel,
  parseCreditExplainInput,
} from "@/lib/bank/credit-explain";

describe("parseCreditExplainInput", () => {
  it("accepts other income with a built-in category", () => {
    const result = parseCreditExplainInput(
      { matchType: "other_income", incomeCategory: "Interest" },
      "Interest",
    );
    expect(result).toEqual({
      ok: true,
      value: {
        matchType: "other_income",
        incomeCategory: "Interest",
        note: null,
      },
    });
  });

  it("requires a note when category is Other", () => {
    const result = parseCreditExplainInput(
      { matchType: "other_income", incomeCategory: "Other" },
      "Other",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/note/i);
    }
  });

  it("accepts Other with a note", () => {
    const result = parseCreditExplainInput(
      {
        matchType: "other_income",
        incomeCategory: "Other",
        note: "Misc cash job",
      },
      "Other",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.note).toBe("Misc cash job");
    }
  });

  it("rejects other income without a resolved category", () => {
    const result = parseCreditExplainInput(
      { matchType: "other_income", incomeCategory: "Unknown" },
      null,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/category/i);
    }
  });

  it("accepts a custom resolved category without a note", () => {
    const result = parseCreditExplainInput(
      { matchType: "other_income", incomeCategory: "Affiliate" },
      "Affiliate",
    );
    expect(result).toEqual({
      ok: true,
      value: {
        matchType: "other_income",
        incomeCategory: "Affiliate",
        note: null,
      },
    });
  });

  it("accepts transfer and tax_or_loan without a category", () => {
    expect(
      parseCreditExplainInput({ matchType: "transfer", note: "from personal" }, null),
    ).toEqual({
      ok: true,
      value: {
        matchType: "transfer",
        incomeCategory: null,
        note: "from personal",
      },
    });
    expect(parseCreditExplainInput({ matchType: "tax_or_loan" }, null)).toEqual({
      ok: true,
      value: {
        matchType: "tax_or_loan",
        incomeCategory: null,
        note: null,
      },
    });
  });
});

describe("creditExplainLabel", () => {
  it("labels other income with category and optional note", () => {
    expect(
      creditExplainLabel({
        matchType: "other_income",
        incomeCategory: "Interest",
      }),
    ).toBe("Other income · Interest");
    expect(
      creditExplainLabel({
        matchType: "other_income",
        incomeCategory: "Grant",
        note: "Innovate UK",
      }),
    ).toBe("Other income · Grant — Innovate UK");
  });

  it("labels transfer and tax_or_loan", () => {
    expect(creditExplainLabel({ matchType: "transfer" })).toBe("Transfer");
    expect(
      creditExplainLabel({ matchType: "tax_or_loan", note: "VAT refund" }),
    ).toBe("Tax or loan — VAT refund");
  });
});
