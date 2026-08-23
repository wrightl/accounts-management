import { describe, it, expect } from "vitest";
import {
  bankCategorySelectOptions,
  formatBankCategory,
  isKnownBankCategory,
  isSelectableBankCategory,
  BANK_SPENDING_CATEGORIES,
} from "@/lib/bank/categories";

describe("bank categories", () => {
  it("recognises known Starling categories", () => {
    expect(isKnownBankCategory("TRAVEL")).toBe(true);
    expect(isKnownBankCategory("SOFTWARE_AND_SUBSCRIPTIONS")).toBe(true);
    expect(isKnownBankCategory("MY_OWN_LABEL")).toBe(false);
  });

  it("formats known categories as title case words", () => {
    expect(formatBankCategory("SOFTWARE_AND_SUBSCRIPTIONS")).toBe(
      "Software and subscriptions",
    );
    expect(formatBankCategory("FOOD_AND_DRINK")).toBe("Food and drink");
    expect(formatBankCategory("REVENUE")).toBe("Revenue");
  });

  it("returns em dash for empty values", () => {
    expect(formatBankCategory(null)).toBe("—");
    expect(formatBankCategory("")).toBe("—");
  });

  it("passes through custom category labels unchanged", () => {
    expect(formatBankCategory("Client hospitality")).toBe("Client hospitality");
  });

  it("lists expected Starling categories from sample data", () => {
    for (const c of [
      "TRAVEL",
      "REVENUE",
      "OTHER",
      "ADMIN",
      "ACCOUNTANCY_FEES",
    ]) {
      expect(BANK_SPENDING_CATEGORIES).toContain(c);
    }
  });

  it("recognises catalogued custom categories as selectable", () => {
    expect(isSelectableBankCategory("Client hospitality", ["Client hospitality"])).toBe(true);
    expect(isSelectableBankCategory("client hospitality", ["Client hospitality"])).toBe(true);
    expect(isSelectableBankCategory("Unknown", ["Client hospitality"])).toBe(false);
    expect(isSelectableBankCategory("TRAVEL", [])).toBe(true);
  });

  it("merges built-in and custom options for dropdowns", () => {
    const options = bankCategorySelectOptions(["Client hospitality", "TRAVEL"]);
    expect(options.map((o) => o.value)).toContain("TRAVEL");
    expect(options.map((o) => o.value)).toContain("Client hospitality");
    expect(options.filter((o) => o.value === "TRAVEL")).toHaveLength(1);
  });
});
