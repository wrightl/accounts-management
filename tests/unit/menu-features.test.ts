import { describe, expect, it } from "vitest";
import {
  MENU_BUNDLES,
  MENU_FEATURES,
  bundlesFor,
  featuresFromAnswers,
  featuresFromFormData,
  isFeatureEnabled,
  menuAnswersFromFormData,
  parseEnabledFeatures,
} from "@/lib/menu/features";

describe("menu bundles", () => {
  it("put every optional feature in exactly one bundle", () => {
    const features = MENU_BUNDLES.flatMap((b) => b.features);
    expect(new Set(features).size).toBe(features.length);
    expect([...features].sort()).toEqual([...MENU_FEATURES].sort());
  });

  it("skip the paying-yourself question for sole traders", () => {
    expect(bundlesFor("sole_trader").map((b) => b.id)).not.toContain("payingYourself");
    expect(bundlesFor("limited_company").map((b) => b.id)).toContain("payingYourself");
  });
});

describe("featuresFromAnswers", () => {
  it("uses each bundle's default when unanswered", () => {
    expect(featuresFromAnswers({}, "limited_company")).toEqual([
      "dividends",
      "shareholders",
      "directorsLoans",
      "safeToPay",
      "reserves",
    ]);
    expect(featuresFromAnswers({}, "sole_trader")).toEqual([]);
  });

  it("turns on the features behind each yes", () => {
    expect(
      featuresFromAnswers(
        { quotes: true, recurring: true, payingYourself: false, routine: true },
        "limited_company",
      ),
    ).toEqual(["close", "bookkeeper", "quotes", "orders", "recurring"]);
  });

  it("ignores limited-company answers for sole traders", () => {
    expect(featuresFromAnswers({ payingYourself: true }, "sole_trader")).toEqual([]);
  });
});

describe("form parsing", () => {
  it("reads yes/no answers", () => {
    const fd = new FormData();
    fd.set("menu_quotes", "yes");
    fd.set("menu_payingYourself", "no");
    fd.set("menu_unknown", "yes");
    expect(menuAnswersFromFormData(fd)).toEqual({ quotes: true, payingYourself: false });
  });

  it("reads ticked features, ignoring unknown values", () => {
    const fd = new FormData();
    fd.append("feature", "forecast");
    fd.append("feature", "quotes");
    fd.append("feature", "nope");
    expect(featuresFromFormData(fd)).toEqual(["quotes", "forecast"]);
  });
});

describe("parseEnabledFeatures", () => {
  it("treats null as show everything", () => {
    expect(parseEnabledFeatures(null)).toBeNull();
    expect(isFeatureEnabled("quotes", null)).toBe(true);
  });

  it("drops unknown stored values", () => {
    const parsed = parseEnabledFeatures(["quotes", "retired_feature"]);
    expect(parsed).toEqual(["quotes"]);
    expect(isFeatureEnabled("quotes", parsed)).toBe(true);
    expect(isFeatureEnabled("orders", parsed)).toBe(false);
  });
});
