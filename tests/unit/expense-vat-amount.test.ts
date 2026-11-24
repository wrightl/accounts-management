import { describe, expect, it } from "vitest";
import {
  ExpenseVatError,
  parseVatPounds,
  resolveExpenseVat,
  vatDiffersFromDerived,
} from "@/lib/expenses/vat-amount";

const base = { amountPence: 1_200, vatRate: 20 };

describe("resolveExpenseVat", () => {
  it("works the VAT out from the rate by default", () => {
    expect(resolveExpenseVat(base)).toEqual({ vatPence: 200, vatPenceSource: "derived" });
    expect(resolveExpenseVat({ ...base, posted: { vatSource: "derived", vatPounds: "1.50" } })).toEqual({
      vatPence: 200,
      vatPenceSource: "derived",
    });
  });

  it("keeps a figure read from the receipt or typed", () => {
    expect(resolveExpenseVat({ ...base, posted: { vatSource: "receipt", vatPounds: "1.98" } })).toEqual({
      vatPence: 198,
      vatPenceSource: "receipt",
    });
    expect(resolveExpenseVat({ ...base, posted: { vatSource: "manual", vatPounds: "£1.50" } })).toEqual({
      vatPence: 150,
      vatPenceSource: "manual",
    });
  });

  it("uses a stored receipt figure when nothing is posted", () => {
    expect(resolveExpenseVat({ ...base, receiptVatPence: 190 })).toEqual({ vatPence: 190, vatPenceSource: "receipt" });
    expect(resolveExpenseVat({ ...base, receiptVatPence: 5_000 })).toEqual({ vatPence: 200, vatPenceSource: "derived" });
  });

  it("has no VAT without a rate, and works it out for another currency", () => {
    expect(resolveExpenseVat({ ...base, vatRate: 0, posted: { vatSource: "manual", vatPounds: "1.00" } })).toEqual({
      vatPence: 0,
      vatPenceSource: "derived",
    });
    expect(
      resolveExpenseVat({ ...base, currency: "USD", posted: { vatSource: "receipt", vatPounds: "1.00" } }),
    ).toEqual({ vatPence: 200, vatPenceSource: "derived" });
    expect(resolveExpenseVat({ ...base, currency: "gbp", posted: { vatSource: "manual", vatPounds: "1.00" } })).toEqual({
      vatPence: 100,
      vatPenceSource: "manual",
    });
  });

  it("falls back to working it out when the posted figure is blank", () => {
    expect(resolveExpenseVat({ ...base, posted: { vatSource: "manual", vatPounds: " " } })).toEqual({
      vatPence: 200,
      vatPenceSource: "derived",
    });
  });

  it("keeps a stored typed figure when no source is posted, while it fits", () => {
    const existing = { vatPence: 150, vatPenceSource: "manual" };
    expect(resolveExpenseVat({ ...base, existing })).toEqual({ vatPence: 150, vatPenceSource: "manual" });
    expect(resolveExpenseVat({ ...base, amountPence: 100, existing })).toEqual({
      vatPence: 17,
      vatPenceSource: "derived",
    });
    expect(resolveExpenseVat({ ...base, existing, posted: { vatSource: "derived" } })).toEqual({
      vatPence: 200,
      vatPenceSource: "derived",
    });
    expect(resolveExpenseVat({ ...base, existing: { vatPence: 150, vatPenceSource: "derived" } })).toEqual({
      vatPence: 200,
      vatPenceSource: "derived",
    });
  });

  it("keeps a stored choice to work VAT out, even with a receipt figure on record", () => {
    expect(
      resolveExpenseVat({ ...base, receiptVatPence: 190, existing: { vatPence: 200, vatPenceSource: "derived" } }),
    ).toEqual({ vatPence: 200, vatPenceSource: "derived" });
    expect(
      resolveExpenseVat({ ...base, receiptVatPence: 190, existing: { vatPence: 190, vatPenceSource: "receipt" } }),
    ).toEqual({ vatPence: 190, vatPenceSource: "receipt" });
  });

  it("refuses a figure that isn't an amount below the total", () => {
    expect(() => resolveExpenseVat({ ...base, posted: { vatSource: "manual", vatPounds: "12.00" } })).toThrow(
      ExpenseVatError,
    );
    expect(() => resolveExpenseVat({ ...base, posted: { vatSource: "manual", vatPounds: "two pounds" } })).toThrow(
      "Enter the VAT as an amount in pounds",
    );
    expect(() => resolveExpenseVat({ ...base, posted: { vatSource: "manual", vatPounds: "-1.00" } })).toThrow(
      ExpenseVatError,
    );
  });
});

describe("helpers", () => {
  it("parses pounds and spots a difference of more than a penny", () => {
    expect(parseVatPounds("2")).toBe(200);
    expect(parseVatPounds("")).toBeNull();
    expect(vatDiffersFromDerived(200, 201)).toBe(false);
    expect(vatDiffersFromDerived(198, 200)).toBe(true);
  });
});
