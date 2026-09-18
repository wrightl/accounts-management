import { describe, it, expect } from "vitest";
import {
  clampVatRate,
  defaultLineVatRate,
  isValidUkVatNumber,
  netFromInclusiveGross,
  normalizeUkVatNumber,
  parseUkVatNumber,
  parseVatRate,
  resolveLineVatRate,
  vatFromInclusiveGross,
} from "@/lib/vat";
import { parseCompanySettingsInput } from "@/lib/settings/schema";

describe("vat helpers", () => {
  it("parses and clamps rates", () => {
    expect(parseVatRate("20")).toBe(20);
    expect(parseVatRate(120)).toBe(100);
    expect(parseVatRate(-5)).toBe(0);
    expect(clampVatRate(20.4)).toBe(20);
  });

  it("forces 0 when company is not VAT registered", () => {
    expect(resolveLineVatRate({ vatRegistered: false }, 20)).toBe(0);
    expect(resolveLineVatRate({ vatRegistered: true }, 20)).toBe(20);
    expect(
      defaultLineVatRate({ vatRegistered: true, defaultVatRate: 20 }),
    ).toBe(20);
    expect(
      defaultLineVatRate({ vatRegistered: false, defaultVatRate: 20 }),
    ).toBe(0);
  });

  it("backs out VAT from inclusive gross", () => {
    expect(vatFromInclusiveGross(12000, 20)).toBe(2000);
    expect(netFromInclusiveGross(12000, 20)).toBe(10000);
    expect(vatFromInclusiveGross(10000, 0)).toBe(0);
  });
});

describe("UK VAT number", () => {
  it("normalizes spaces, case, and bare digits", () => {
    expect(normalizeUkVatNumber("gb 434 0314 94")).toBe("GB434031494");
    expect(normalizeUkVatNumber("434031494")).toBe("GB434031494");
    expect(normalizeUkVatNumber("434031494001")).toBe("GB434031494001");
  });

  it("accepts valid standard, branch, GD, and HA numbers", () => {
    expect(isValidUkVatNumber("GB434031494")).toBe(true);
    expect(isValidUkVatNumber("GB434031494001")).toBe(true);
    expect(isValidUkVatNumber("GBGD001")).toBe(true);
    expect(isValidUkVatNumber("GBHA500")).toBe(true);
  });

  it("rejects bad checksum, length, and non-UK forms", () => {
    expect(isValidUkVatNumber("GB123456789")).toBe(false);
    expect(isValidUkVatNumber("GB12345678")).toBe(false);
    expect(isValidUkVatNumber("IE1234567T")).toBe(false);
    expect(isValidUkVatNumber("GBHA100")).toBe(false);
    expect(isValidUkVatNumber("GBGD500")).toBe(false);
  });

  it("parseUkVatNumber returns normalized value or message", () => {
    expect(parseUkVatNumber("434 0314 94")).toEqual({
      ok: true,
      value: "GB434031494",
    });
    expect(parseUkVatNumber("").ok).toBe(false);
    expect(parseUkVatNumber("GB123456789").ok).toBe(false);
  });
});

describe("parseCompanySettingsInput", () => {
  const base = {
    name: "Acme",
    legalName: "Acme Ltd",
    companyNumber: "",
    utr: "",
    vatRegistered: "",
    vatNumber: "",
    defaultVatRate: "20",
    addressLines: "",
    email: "",
    bankAccountName: "",
    sortCode: "",
    accountNumber: "",
    financialYearStartMonth: "4",
    invoiceNumberPrefix: "DD",
    quoteNumberPrefix: "Q",
    orderNumberPrefix: "O",
    invoicePaymentTermsDays: "14",
    defaultMileageRatePence: "45",
    bankProvider: "starling",
    bankName: "",
  };

  it("requires trading name", () => {
    const result = parseCompanySettingsInput({ ...base, name: "" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.name).toMatch(/trading name/i);
  });

  it("rejects invalid email", () => {
    const result = parseCompanySettingsInput({
      ...base,
      email: "not-an-email",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.email).toMatch(/email/i);
  });

  it("requires valid UK VAT when registered", () => {
    const missing = parseCompanySettingsInput({
      ...base,
      vatRegistered: "on",
      vatNumber: "",
    });
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.fieldErrors.vatNumber).toBeTruthy();

    const bad = parseCompanySettingsInput({
      ...base,
      vatRegistered: "on",
      vatNumber: "GB123456789",
    });
    expect(bad.ok).toBe(false);

    const good = parseCompanySettingsInput({
      ...base,
      vatRegistered: "on",
      vatNumber: "GB 434 0314 94",
    });
    expect(good.ok).toBe(true);
    if (!good.ok) return;
    expect(good.data.vatNumber).toBe("GB434031494");
  });

  it("requires bank provider", () => {
    const result = parseCompanySettingsInput({
      ...base,
      bankProvider: "",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.bankProvider).toMatch(/bank/i);
  });
});
