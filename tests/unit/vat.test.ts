import { describe, it, expect } from "vitest";
import {
  clampVatRate,
  defaultLineVatRate,
  netFromInclusiveGross,
  parseVatRate,
  resolveLineVatRate,
  vatFromInclusiveGross,
} from "@/lib/vat";

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
    expect(defaultLineVatRate({ vatRegistered: true, defaultVatRate: 20 })).toBe(20);
    expect(defaultLineVatRate({ vatRegistered: false, defaultVatRate: 20 })).toBe(0);
  });

  it("backs out VAT from inclusive gross", () => {
    // £120 inc 20% VAT → £20 VAT, £100 net
    expect(vatFromInclusiveGross(12000, 20)).toBe(2000);
    expect(netFromInclusiveGross(12000, 20)).toBe(10000);
    expect(vatFromInclusiveGross(10000, 0)).toBe(0);
  });
});
