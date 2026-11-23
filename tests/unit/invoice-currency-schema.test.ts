import { describe, expect, it } from "vitest";
import { parseClientInput } from "@/lib/clients/schema";
import { parseInvoiceInput } from "@/lib/invoices/schema";

const invoice = (extra: Record<string, unknown>) => ({
  clientId: "00000000-0000-4000-8000-000000000001",
  issueDate: "2026-05-01",
  lines: [{ description: "Work", quantity: 1, unitPricePounds: "70", vatRate: 0 }],
  ...extra,
});

describe("invoice currency input", () => {
  it("defaults to sterling with no rate", () => {
    const parsed = parseInvoiceInput(invoice({ currency: "", fxRate: "" }));
    expect(parsed.ok && parsed.data).toMatchObject({ currency: "GBP", fxRate: null });
  });

  it("takes a listed currency and a typed rate", () => {
    const parsed = parseInvoiceInput(invoice({ currency: "usd", fxRate: " 1.2731 " }));
    expect(parsed.ok && parsed.data).toMatchObject({ currency: "USD", fxRate: 1.2731 });
  });

  it("refuses an unlisted currency or a rate that isn't positive", () => {
    expect(parseInvoiceInput(invoice({ currency: "JPY" })).ok).toBe(false);
    const bad = parseInvoiceInput(invoice({ currency: "USD", fxRate: "0" }));
    expect(!bad.ok && bad.fieldErrors.fxRate).toBe("Enter an exchange rate above 0");
  });
});

describe("client default currency", () => {
  it("stores sterling as no default", () => {
    const parsed = parseClientInput({ name: "Acme", email: "", defaultCurrency: "GBP" });
    expect(parsed.ok && parsed.data.defaultCurrency).toBeNull();
  });

  it("keeps a foreign default and refuses unlisted ones", () => {
    const parsed = parseClientInput({ name: "Acme", email: "", defaultCurrency: "eur" });
    expect(parsed.ok && parsed.data.defaultCurrency).toBe("EUR");
    expect(parseClientInput({ name: "Acme", email: "", defaultCurrency: "XYZ" }).ok).toBe(false);
  });
});
