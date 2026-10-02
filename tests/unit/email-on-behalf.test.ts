import { describe, expect, it } from "vitest";
import {
  buildOnBehalfSender,
  domainFromEmailFrom,
  firstNameFromDisplay,
  localPartFromName,
} from "@/lib/email/on-behalf";

const EMAIL_FROM = "Alfa by Dot+Dash <accounts@alfa.dotanddashconsulting.com>";

describe("domainFromEmailFrom", () => {
  it("extracts domain from angled From", () => {
    expect(domainFromEmailFrom(EMAIL_FROM)).toBe("alfa.dotanddashconsulting.com");
  });

  it("extracts domain from bare address", () => {
    expect(domainFromEmailFrom("accounts@example.com")).toBe("example.com");
  });
});

describe("localPartFromName", () => {
  it("uses the first name token lowercased", () => {
    expect(localPartFromName("Lee Wright")).toBe("lee");
  });

  it("strips accents and unsafe characters", () => {
    expect(localPartFromName("José O'Brien!")).toBe("jose");
  });

  it("returns null for empty or unusable names", () => {
    expect(localPartFromName("")).toBeNull();
    expect(localPartFromName("   ")).toBeNull();
    expect(localPartFromName("!!!")).toBeNull();
    expect(localPartFromName(null)).toBeNull();
  });
});

describe("firstNameFromDisplay", () => {
  it("keeps the original casing of the first token", () => {
    expect(firstNameFromDisplay("Lee Wright")).toBe("Lee");
  });
});

describe("buildOnBehalfSender", () => {
  it("builds personalised From and Reply-To", () => {
    expect(
      buildOnBehalfSender({
        person: { name: "Lee Wright", email: "lee@northwind.test" },
        companyName: "Northwind Inc",
        emailFrom: EMAIL_FROM,
      }),
    ).toEqual({
      from: "Lee at Northwind Inc <lee@alfa.dotanddashconsulting.com>",
      replyTo: "lee@northwind.test",
    });
  });

  it("quotes display names that contain commas", () => {
    expect(
      buildOnBehalfSender({
        person: { name: "Lee", email: "lee@northwind.test" },
        companyName: "Northwind, Inc",
        emailFrom: EMAIL_FROM,
      }).from,
    ).toBe('"Lee at Northwind, Inc" <lee@alfa.dotanddashconsulting.com>');
  });

  it("falls back to EMAIL_FROM when the name cannot form a local-part", () => {
    expect(
      buildOnBehalfSender({
        person: { name: "!!!", email: "lee@northwind.test" },
        companyName: "Northwind Inc",
        emailFrom: EMAIL_FROM,
      }),
    ).toEqual({
      from: EMAIL_FROM,
      replyTo: "lee@northwind.test",
    });
  });

  it("falls back to EMAIL_FROM when name is missing", () => {
    expect(
      buildOnBehalfSender({
        person: { name: null, email: "lee@northwind.test" },
        companyName: "Northwind Inc",
        emailFrom: EMAIL_FROM,
      }),
    ).toEqual({
      from: EMAIL_FROM,
      replyTo: "lee@northwind.test",
    });
  });

  it("omits replyTo when the person has no email", () => {
    expect(
      buildOnBehalfSender({
        person: { name: "Lee", email: null },
        companyName: "Northwind Inc",
        emailFrom: EMAIL_FROM,
      }),
    ).toEqual({
      from: "Lee at Northwind Inc <lee@alfa.dotanddashconsulting.com>",
      replyTo: undefined,
    });
  });
});
