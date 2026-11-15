import { describe, expect, it } from "vitest";
import {
  hasVatOnDocuments,
  profitAndLossBasisNote,
  shouldShowVat,
} from "@/lib/reports/vat-display";

const noVat = { salesVatPence: 0, creditNoteVatPence: 0, purchaseVatPence: 0 };

describe("hasVatOnDocuments", () => {
  it("is false when no document records VAT", () => {
    expect(hasVatOnDocuments(noVat)).toBe(false);
  });

  it("is true for VAT on sales, credit notes or purchases", () => {
    expect(hasVatOnDocuments({ ...noVat, salesVatPence: 2000 })).toBe(true);
    expect(hasVatOnDocuments({ ...noVat, creditNoteVatPence: 500 })).toBe(true);
    expect(hasVatOnDocuments({ ...noVat, purchaseVatPence: 300 })).toBe(true);
  });

  it("is true when a credit note cancels the VAT on an invoice", () => {
    // Net sales VAT is 0 here, but both documents record VAT.
    expect(
      hasVatOnDocuments({ ...noVat, salesVatPence: 2000, creditNoteVatPence: 2000 }),
    ).toBe(true);
  });
});

describe("shouldShowVat", () => {
  it("shows VAT to a registered company even with none on documents", () => {
    expect(shouldShowVat({ vatRegistered: true, hasVatOnDocuments: false })).toBe(true);
  });

  it("hides VAT from an unregistered company with none on documents", () => {
    expect(shouldShowVat({ vatRegistered: false, hasVatOnDocuments: false })).toBe(false);
  });

  it("shows VAT to an unregistered company whose documents record some", () => {
    expect(shouldShowVat({ vatRegistered: false, hasVatOnDocuments: true })).toBe(true);
  });
});

describe("profitAndLossBasisNote", () => {
  it("mentions VAT only when VAT is shown", () => {
    expect(profitAndLossBasisNote(true)).toMatch(/VAT/);
    expect(profitAndLossBasisNote(false)).not.toMatch(/VAT/);
  });
});
