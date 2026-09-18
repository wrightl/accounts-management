import { describe, expect, it } from "vitest";
import { SIGN_UP_PATH, signUpHref } from "@/lib/marketing-analytics";

describe("signUpHref", () => {
  it("returns the bare sign-up path with no params", () => {
    expect(signUpHref()).toBe(SIGN_UP_PATH);
    expect(signUpHref({})).toBe(SIGN_UP_PATH);
  });

  it("tags pricing CTAs with from and optional plan", () => {
    expect(signUpHref({ from: "pricing" })).toBe("/sign-up?from=pricing");
    expect(signUpHref({ from: "pricing", plan: "essentials" })).toBe(
      "/sign-up?from=pricing&plan=essentials",
    );
    expect(signUpHref({ from: "pricing", plan: "premium" })).toBe(
      "/sign-up?from=pricing&plan=premium",
    );
  });
});
