import { describe, expect, it } from "vitest";
import { clientBillToLines, clientDisplayName } from "@/lib/clients/display";

describe("client display name", () => {
  it("uses the company name when set", () => {
    expect(
      clientDisplayName({ name: "Jane Smith", companyName: "Acme Ltd" }),
    ).toBe("Acme Ltd");
  });

  it("falls back to the contact name", () => {
    expect(clientDisplayName({ name: "Jane Smith", companyName: null })).toBe(
      "Jane Smith",
    );
    expect(clientDisplayName({ name: "Jane Smith", companyName: "  " })).toBe(
      "Jane Smith",
    );
  });

  it("lists company then contact on documents", () => {
    expect(
      clientBillToLines({ name: "Jane Smith", companyName: "Acme Ltd" }),
    ).toEqual(["Acme Ltd", "Jane Smith"]);
  });

  it("does not duplicate a matching company and contact", () => {
    expect(
      clientBillToLines({ name: "Acme Ltd", companyName: "Acme Ltd" }),
    ).toEqual(["Acme Ltd"]);
  });
});
