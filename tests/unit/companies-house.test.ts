import { describe, expect, it } from "vitest";
import {
  normaliseCompanyNumber,
  officerDisplayName,
  parseCompanyProfile,
  parseDirectorNames,
  suggestTradingName,
} from "@/lib/companies-house/parse";
import { directorNamesSchema, splitDirectorNames } from "@/lib/companies-house/schema";

describe("normaliseCompanyNumber", () => {
  it("pads numeric numbers and keeps prefixes", () => {
    expect(normaliseCompanyNumber("1234567")).toBe("01234567");
    expect(normaliseCompanyNumber(" sc 123456 ")).toBe("SC123456");
    expect(normaliseCompanyNumber("not a number")).toBeNull();
    expect(normaliseCompanyNumber("")).toBeNull();
  });
});

describe("officerDisplayName", () => {
  it("turns Companies House order into a display name", () => {
    expect(officerDisplayName("SMITH, Jane Anne")).toBe("Jane Anne Smith");
    expect(officerDisplayName("O'BRIEN-JONES, Sam")).toBe("Sam O'Brien-Jones");
    expect(officerDisplayName("Acme Nominees Limited")).toBe("Acme Nominees Limited");
  });
});

describe("parseCompanyProfile", () => {
  it("reads the fields Alfa uses", () => {
    const company = parseCompanyProfile({
      company_number: "01234567",
      company_name: "DOT AND DASH CONSULTING LTD",
      company_status: "active",
      date_of_creation: "2019-05-01",
      registered_office_address: {
        premises: "2",
        address_line_1: "High Street",
        locality: "Bristol",
        postal_code: "BS1 1AA",
        country: "England",
      },
      accounts: {
        accounting_reference_date: { day: "31", month: "03" },
        next_due: "2026-12-31",
      },
      confirmation_statement: { next_due: "2027-05-15" },
    });
    expect(company).toEqual({
      companyNumber: "01234567",
      companyName: "DOT AND DASH CONSULTING LTD",
      status: "active",
      incorporatedOn: "2019-05-01",
      registeredOffice: "2 High Street\nBristol\nBS1 1AA\nEngland",
      yearEndMonth: 3,
      accountsDue: "2026-12-31",
      confirmationStatementDue: "2027-05-15",
      directors: [],
    });
  });

  it("copes with missing sections and rejects nonsense", () => {
    expect(
      parseCompanyProfile({ company_number: "SC123456", company_name: "New Co" }),
    ).toMatchObject({ registeredOffice: null, yearEndMonth: null, accountsDue: null });
    expect(parseCompanyProfile({ errors: [] })).toBeNull();
  });
});

describe("parseDirectorNames", () => {
  it("keeps current directors only", () => {
    expect(
      parseDirectorNames({
        items: [
          { name: "SMITH, Jane", officer_role: "director" },
          { name: "JONES, Old", officer_role: "director", resigned_on: "2024-01-01" },
          { name: "BLOGGS, Fred", officer_role: "secretary" },
          { name: "Holdco Limited", officer_role: "corporate-director" },
        ],
      }),
    ).toEqual(["Jane Smith", "Holdco Limited"]);
  });
});

describe("suggestTradingName", () => {
  it("drops the suffix and fixes shouting", () => {
    expect(suggestTradingName("DOT AND DASH CONSULTING LTD")).toBe("Dot And Dash Consulting");
    expect(suggestTradingName("Acme Studio Limited")).toBe("Acme Studio");
    expect(suggestTradingName("LTD")).toBe("Ltd");
  });
});

describe("director names", () => {
  it("stores one per line and splits back", () => {
    expect(directorNamesSchema.parse("  Jane Smith \n\n Sam Jones ")).toBe("Jane Smith\nSam Jones");
    expect(directorNamesSchema.parse("   ")).toBeNull();
    expect(splitDirectorNames("Jane Smith\nSam Jones")).toEqual(["Jane Smith", "Sam Jones"]);
    expect(splitDirectorNames(null)).toEqual([]);
  });
});
