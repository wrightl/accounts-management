import { describe, expect, it } from "vitest";
import {
  parseSignupPlanCookie,
  parseSignupPlanQuery,
  serializeSignupPlanCookie,
  signupPlanChoiceSchema,
  signupPlanLabel,
} from "@/lib/signup-plan";

describe("parseSignupPlanQuery", () => {
  it("accepts trial, essentials, and premium", () => {
    expect(parseSignupPlanQuery("trial")).toBe("trial");
    expect(parseSignupPlanQuery("essentials")).toBe("essentials");
    expect(parseSignupPlanQuery("premium")).toBe("premium");
  });

  it("rejects missing or invalid values", () => {
    expect(parseSignupPlanQuery(undefined)).toBeNull();
    expect(parseSignupPlanQuery(null)).toBeNull();
    expect(parseSignupPlanQuery("")).toBeNull();
    expect(parseSignupPlanQuery("studio")).toBeNull();
  });
});

describe("signupPlanChoiceSchema", () => {
  it("requires interval for paid plans", () => {
    expect(signupPlanChoiceSchema.safeParse({ plan: "trial" }).success).toBe(
      true,
    );
    expect(
      signupPlanChoiceSchema.safeParse({
        plan: "essentials",
        interval: "month",
      }).success,
    ).toBe(true);
    expect(
      signupPlanChoiceSchema.safeParse({ plan: "essentials" }).success,
    ).toBe(false);
    expect(signupPlanChoiceSchema.safeParse({ plan: "foo" }).success).toBe(
      false,
    );
  });
});

describe("signup plan cookie", () => {
  it("round-trips a valid choice", () => {
    const choice = {
      plan: "premium" as const,
      interval: "year" as const,
    };
    const raw = serializeSignupPlanCookie(choice);
    expect(parseSignupPlanCookie(raw)).toEqual(choice);
  });

  it("returns null for invalid cookie payloads", () => {
    expect(parseSignupPlanCookie(undefined)).toBeNull();
    expect(parseSignupPlanCookie("not-json")).toBeNull();
    expect(parseSignupPlanCookie('{"plan":"essentials"}')).toBeNull();
  });

  it("labels choices for UI", () => {
    expect(signupPlanLabel({ plan: "trial" })).toBe("Trial");
    expect(
      signupPlanLabel({ plan: "essentials", interval: "month" }),
    ).toBe("Essentials (monthly)");
  });
});
