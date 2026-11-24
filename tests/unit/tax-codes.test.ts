import { describe, it, expect } from "vitest";
import {
  TAX_CODES,
  TAX_CODE_INFO,
  TaxCodeNotAllowedError,
  TaxCodeNotRecognisedError,
  TaxRateNotRecognisedError,
  defaultLineTax,
  en16931Category,
  inferExpenseTaxCode,
  inferTaxCodeFromRate,
  isRatedTaxCode,
  isTaxCode,
  parseTaxCode,
  rateForTaxCode,
  resolveLineTax,
  taxCodeDisplay,
  taxCodesFor,
} from "@/lib/tax-codes";

const registered = { vatRegistered: true };
const unregistered = { vatRegistered: false };

describe("tax codes", () => {
  it("maps each code to its EN 16931 category", () => {
    expect(en16931Category("standard")).toBe("S");
    expect(en16931Category("reduced")).toBe("AA");
    expect(en16931Category("zero_rated")).toBe("Z");
    expect(en16931Category("exempt")).toBe("E");
    expect(en16931Category("outside_scope")).toBe("O");
    expect(en16931Category("reverse_charge")).toBe("AE");
    expect(en16931Category("export")).toBe("G");
    expect(en16931Category("eu_supply")).toBe("K");
    expect(en16931Category("postponed_import")).toBeNull();
  });

  it("gives every sales code a category", () => {
    for (const code of taxCodesFor("sales")) {
      expect(en16931Category(code)).not.toBeNull();
    }
  });

  it("keeps info in step with the code list", () => {
    expect(Object.keys(TAX_CODE_INFO).sort()).toEqual([...TAX_CODES].sort());
    for (const code of TAX_CODES) {
      const info = TAX_CODE_INFO[code];
      expect(info.code).toBe(code);
      expect(info.rated).toBe(info.defaultRate > 0);
    }
  });

  it("only rates standard and reduced", () => {
    expect(TAX_CODES.filter(isRatedTaxCode)).toEqual(["standard", "reduced"]);
  });

  it("limits codes to sales or purchases", () => {
    expect(taxCodesFor("sales")).toContain("export");
    expect(taxCodesFor("sales")).toContain("eu_supply");
    expect(taxCodesFor("sales")).not.toContain("postponed_import");
    expect(taxCodesFor("purchases")).toContain("postponed_import");
    expect(taxCodesFor("purchases")).not.toContain("export");
    expect(taxCodesFor("purchases")).not.toContain("eu_supply");
  });

  it("parses posted codes", () => {
    expect(parseTaxCode("standard")).toBe("standard");
    expect(parseTaxCode(" Zero_Rated ")).toBe("zero_rated");
    expect(parseTaxCode("vat20")).toBeNull();
    expect(parseTaxCode("")).toBeNull();
    expect(parseTaxCode(20)).toBeNull();
    expect(parseTaxCode(null)).toBeNull();
    expect(isTaxCode("exempt")).toBe(true);
    expect(isTaxCode("EXEMPT")).toBe(false);
  });
});

describe("rateForTaxCode", () => {
  it("gives each code its own rate", () => {
    expect(rateForTaxCode("standard")).toBe(20);
    expect(rateForTaxCode("reduced")).toBe(5);
    expect(rateForTaxCode("zero_rated")).toBe(0);
    expect(rateForTaxCode("exempt")).toBe(0);
    expect(rateForTaxCode("reverse_charge")).toBe(0);
  });
});

describe("taxCodeDisplay", () => {
  it("shows the rate for rated codes only", () => {
    expect(taxCodeDisplay("standard")).toBe("Standard rate 20%");
    expect(taxCodeDisplay("reduced")).toBe("Reduced rate 5%");
    expect(taxCodeDisplay("exempt")).toBe("Exempt");
  });
});

describe("inferTaxCodeFromRate", () => {
  it("treats everything as outside scope when not VAT registered", () => {
    expect(inferTaxCodeFromRate(20, unregistered)).toEqual({
      code: "outside_scope",
      needsReview: false,
    });
    expect(inferTaxCodeFromRate(0, {})).toEqual({ code: "outside_scope", needsReview: false });
  });

  it("maps the UK rates", () => {
    expect(inferTaxCodeFromRate(20, registered)).toEqual({ code: "standard", needsReview: false });
    expect(inferTaxCodeFromRate(5, registered)).toEqual({ code: "reduced", needsReview: false });
    expect(inferTaxCodeFromRate(0, registered)).toEqual({
      code: "zero_rated",
      needsReview: false,
    });
    expect(inferTaxCodeFromRate(null, registered)).toEqual({
      code: "zero_rated",
      needsReview: false,
    });
  });

  it("flags other rates as standard to check", () => {
    expect(inferTaxCodeFromRate(17, registered)).toEqual({ code: "standard", needsReview: true });
  });

  it("matches rates exactly rather than rounding", () => {
    for (const rate of [19.6, 5.4, 0.4]) {
      expect(inferTaxCodeFromRate(rate, registered)).toEqual({
        code: "standard",
        needsReview: true,
      });
    }
    expect(inferTaxCodeFromRate(0.1 + 0.2 + 19.7, registered)).toEqual({
      code: "standard",
      needsReview: false,
    });
  });
});

describe("inferExpenseTaxCode", () => {
  const zero = (category: string | null, currency: string | null = "GBP") =>
    inferExpenseTaxCode({ vatRate: 0, category, currency }, registered);

  it("follows the rate when it is above 0", () => {
    expect(inferExpenseTaxCode({ vatRate: 20, category: "Training" }, registered)).toEqual({
      code: "standard",
      needsReview: false,
    });
  });

  it("is outside scope for unregistered companies", () => {
    expect(inferExpenseTaxCode({ vatRate: 0, category: "Training" }, unregistered)).toEqual({
      code: "outside_scope",
      needsReview: false,
    });
  });

  it("guesses 0% expenses from the category", () => {
    expect(zero("Travel")).toEqual({ code: "zero_rated", needsReview: false });
    expect(zero("Training")).toEqual({ code: "exempt", needsReview: true });
    expect(zero("Software", "USD")).toEqual({ code: "reverse_charge", needsReview: true });
    expect(zero("software", "usd")).toEqual({ code: "reverse_charge", needsReview: true });
  });

  it("flags anything it cannot tell", () => {
    expect(zero("Software")).toEqual({ code: "zero_rated", needsReview: true });
    expect(zero("Software", null)).toEqual({ code: "zero_rated", needsReview: true });
    expect(zero("Other")).toEqual({ code: "zero_rated", needsReview: true });
    expect(zero(null)).toEqual({ code: "zero_rated", needsReview: true });
  });
});

describe("defaultLineTax", () => {
  it("is outside scope at 0% when not registered", () => {
    expect(defaultLineTax({ vatRegistered: false, defaultTaxCode: "standard" })).toEqual({
      taxCode: "outside_scope",
      vatRate: 0,
      needsReview: false,
    });
  });

  it("uses the company default code with the code's own rate", () => {
    expect(
      defaultLineTax({ vatRegistered: true, defaultTaxCode: "reduced", defaultVatRate: 20 }),
    ).toEqual({ taxCode: "reduced", vatRate: 5, needsReview: false });
    expect(
      defaultLineTax({ vatRegistered: true, defaultTaxCode: "standard", defaultVatRate: 5 }),
    ).toEqual({ taxCode: "standard", vatRate: 20, needsReview: false });
    expect(defaultLineTax({ vatRegistered: true, defaultTaxCode: "zero_rated" })).toEqual({
      taxCode: "zero_rated",
      vatRate: 0,
      needsReview: false,
    });
  });

  it("falls back to the default rate before codes exist", () => {
    expect(defaultLineTax({ vatRegistered: true, defaultVatRate: 20 })).toEqual({
      taxCode: "standard",
      vatRate: 20,
      needsReview: false,
    });
    expect(defaultLineTax({ vatRegistered: true, defaultVatRate: 5 })).toEqual({
      taxCode: "reduced",
      vatRate: 5,
      needsReview: false,
    });
    expect(defaultLineTax({ vatRegistered: true })).toEqual({
      taxCode: "standard",
      vatRate: 20,
      needsReview: false,
    });
  });

  it("flags a default rate that is not a UK rate rather than charging 20% quietly", () => {
    for (const rate of [17, 19.6]) {
      expect(defaultLineTax({ vatRegistered: true, defaultVatRate: rate })).toEqual({
        taxCode: "standard",
        vatRate: 20,
        needsReview: true,
      });
    }
  });
});

describe("resolveLineTax", () => {
  it("ignores posted values when not registered", () => {
    expect(resolveLineTax(unregistered, { taxCode: "standard", vatRate: 20 }, "sales")).toEqual({
      taxCode: "outside_scope",
      vatRate: 0,
    });
  });

  it("keeps a posted code with the code's own rate", () => {
    expect(resolveLineTax(registered, { taxCode: "standard", vatRate: 20 }, "sales")).toEqual({
      taxCode: "standard",
      vatRate: 20,
    });
    expect(resolveLineTax(registered, { taxCode: "standard", vatRate: 5 }, "sales")).toEqual({
      taxCode: "standard",
      vatRate: 20,
    });
    expect(resolveLineTax(registered, { taxCode: "reduced", vatRate: 20 }, "sales")).toEqual({
      taxCode: "reduced",
      vatRate: 5,
    });
    expect(resolveLineTax(registered, { taxCode: "exempt", vatRate: 20 }, "sales")).toEqual({
      taxCode: "exempt",
      vatRate: 0,
    });
    expect(resolveLineTax(registered, { taxCode: "standard" }, "purchases")).toEqual({
      taxCode: "standard",
      vatRate: 20,
    });
  });

  it("infers the code when only a rate is posted", () => {
    expect(resolveLineTax(registered, { vatRate: 20 }, "sales")).toEqual({
      taxCode: "standard",
      vatRate: 20,
    });
    expect(resolveLineTax(registered, { vatRate: 0 }, "sales")).toEqual({
      taxCode: "zero_rated",
      vatRate: 0,
    });
    for (const taxCode of [undefined, null, "", "  "]) {
      expect(resolveLineTax(registered, { taxCode, vatRate: 5 }, "sales")).toEqual({
        taxCode: "reduced",
        vatRate: 5,
      });
    }
  });

  it("refuses a posted code it does not recognise", () => {
    expect(() => resolveLineTax(registered, { taxCode: "bogus", vatRate: 5 }, "sales")).toThrow(
      TaxCodeNotRecognisedError,
    );
    expect(() => resolveLineTax(registered, { taxCode: "stadard" }, "sales")).toThrow(
      '"stadard" is not a tax code',
    );
    expect(() => resolveLineTax(registered, { taxCode: 20 }, "sales")).toThrow(
      TaxCodeNotRecognisedError,
    );
  });

  it("ignores an unknown code when not registered", () => {
    expect(resolveLineTax(unregistered, { taxCode: "bogus" }, "sales")).toEqual({
      taxCode: "outside_scope",
      vatRate: 0,
    });
  });

  it("refuses a bare rate that is not a UK rate", () => {
    expect(() => resolveLineTax(registered, { vatRate: 17 }, "sales")).toThrow(
      TaxRateNotRecognisedError,
    );
    expect(() => resolveLineTax(registered, { vatRate: 17.6 }, "purchases")).toThrow(
      "17.6% is not a UK VAT rate",
    );
  });

  it("refuses near misses rather than rounding them to a UK rate", () => {
    for (const rate of [19.6, 5.4, 0.4]) {
      expect(() => resolveLineTax(registered, { vatRate: rate }, "sales")).toThrow(
        `${rate}% is not a UK VAT rate`,
      );
    }
  });

  it("refuses a code that does not apply", () => {
    expect(() =>
      resolveLineTax(registered, { taxCode: "postponed_import" }, "sales"),
    ).toThrow(TaxCodeNotAllowedError);
    expect(() => resolveLineTax(registered, { taxCode: "export" }, "purchases")).toThrow(
      "Export of goods cannot be used on purchases",
    );
  });
});
