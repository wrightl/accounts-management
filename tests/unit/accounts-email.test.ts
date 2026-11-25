import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({
  serverEnv: () => ({ EMAIL_FROM: "Alfa <books@alfa.example>" }),
}));
const getUser = vi.fn();
vi.mock("@/lib/users", () => ({ getUser: (...args: unknown[]) => getUser(...args) }));
const getDb = vi.fn();
vi.mock("@/db", () => ({ getDb: () => getDb() }));

import { buildCompanySender } from "@/lib/email/on-behalf";
import { resolveClientEmailSender } from "@/lib/email/resolve-client-sender";
import { resolvePdfCompanyEmail } from "@/lib/pdf/company-email";
import { parseCompanySettingsInput } from "@/lib/settings/schema";

describe("resolvePdfCompanyEmail", () => {
  it("prefers the accounts email", () => {
    expect(
      resolvePdfCompanyEmail({ accountsEmail: "accounts@acme.example", email: "hi@acme.example" }),
    ).toBe("accounts@acme.example");
  });

  it("falls back to the company email", () => {
    expect(resolvePdfCompanyEmail({ accountsEmail: "  ", email: "hi@acme.example" })).toBe(
      "hi@acme.example",
    );
    expect(resolvePdfCompanyEmail({ accountsEmail: null, email: "hi@acme.example" })).toBe(
      "hi@acme.example",
    );
  });

  it("falls back to the EMAIL_FROM address", () => {
    expect(resolvePdfCompanyEmail({ accountsEmail: null, email: null })).toBe("books@alfa.example");
    expect(resolvePdfCompanyEmail({})).toBe("books@alfa.example");
  });
});

describe("buildCompanySender", () => {
  it("sends as the company from the EMAIL_FROM address", () => {
    expect(
      buildCompanySender({
        companyName: "Acme Ltd",
        accountsEmail: "accounts@acme.example",
        emailFrom: "Alfa <books@alfa.example>",
      }),
    ).toEqual({ from: "Acme Ltd <books@alfa.example>", replyTo: "accounts@acme.example" });
  });

  it("accepts a bare EMAIL_FROM", () => {
    expect(
      buildCompanySender({
        companyName: "Acme",
        accountsEmail: "accounts@acme.example",
        emailFrom: "books@alfa.example",
      }).from,
    ).toBe("Acme <books@alfa.example>");
  });

  it("quotes names that need it", () => {
    expect(
      buildCompanySender({
        companyName: "Smith, Jones & Co",
        accountsEmail: "accounts@sj.example",
        emailFrom: "books@alfa.example",
      }).from,
    ).toBe('"Smith, Jones & Co" <books@alfa.example>');
  });

  it("keeps EMAIL_FROM when the company has no name", () => {
    expect(
      buildCompanySender({
        companyName: " ",
        accountsEmail: "accounts@acme.example",
        emailFrom: "Alfa <books@alfa.example>",
      }),
    ).toEqual({ from: "Alfa <books@alfa.example>", replyTo: "accounts@acme.example" });
  });
});

describe("resolveClientEmailSender", () => {
  it("uses the accounts email without looking up a person", async () => {
    const sender = await resolveClientEmailSender({
      companyId: "c1",
      companyName: "Acme",
      accountsEmail: "accounts@acme.example",
      actorUserId: "u1",
    });
    expect(sender).toEqual({ from: "Acme <books@alfa.example>", replyTo: "accounts@acme.example" });
    expect(getUser).not.toHaveBeenCalled();
    expect(getDb).not.toHaveBeenCalled();
  });

  it("sends on behalf of the acting user when there is no accounts email", async () => {
    getUser.mockResolvedValueOnce({ name: "Lee Wright", email: "lee@acme.example" });
    const sender = await resolveClientEmailSender({
      companyId: "c1",
      companyName: "Acme",
      accountsEmail: null,
      actorUserId: "u1",
    });
    expect(sender).toEqual({ from: "Lee at Acme <lee@alfa.example>", replyTo: "lee@acme.example" });
  });
});

describe("parseCompanySettingsInput accountsEmail", () => {
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
    creditNoteNumberPrefix: "CN",
    invoicePaymentTermsDays: "14",
    defaultMileageRatePence: "45",
    bankProvider: "starling",
    bankName: "",
  };

  it("stores blank or missing as null", () => {
    const blank = parseCompanySettingsInput({ ...base, accountsEmail: "" });
    const missing = parseCompanySettingsInput(base);
    expect(blank.ok && blank.data.accountsEmail).toBeNull();
    expect(missing.ok && missing.data.accountsEmail).toBeNull();
  });

  it("accepts a valid address", () => {
    const result = parseCompanySettingsInput({ ...base, accountsEmail: "accounts@acme.example" });
    expect(result.ok && result.data.accountsEmail).toBe("accounts@acme.example");
  });

  it("rejects an invalid address", () => {
    const result = parseCompanySettingsInput({ ...base, accountsEmail: "not-an-email" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors?.accountsEmail).toBeTruthy();
  });
});
