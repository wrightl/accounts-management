import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIER_LIMITS,
  PAST_DUE_GRACE_DAYS,
  PLAN_PRICES_PENCE,
  TRIAL_DAYS,
} from "@/lib/billing/constants";

describe("billing constants", () => {
  it("seeds trial and essentials at 5 users", () => {
    expect(DEFAULT_TIER_LIMITS.trial.maxUsers).toBe(5);
    expect(DEFAULT_TIER_LIMITS.essentials.maxUsers).toBe(5);
    expect(DEFAULT_TIER_LIMITS.premium.maxUsers).toBe(15);
  });

  it("gates VAT export on paid tiers only", () => {
    expect(DEFAULT_TIER_LIMITS.trial.vatExport).toBe(false);
    expect(DEFAULT_TIER_LIMITS.essentials.vatExport).toBe(true);
    expect(DEFAULT_TIER_LIMITS.premium.vatExport).toBe(true);
  });

  it("keeps pricing and trial length", () => {
    expect(TRIAL_DAYS).toBe(30);
    expect(PAST_DUE_GRACE_DAYS).toBe(7);
    expect(PLAN_PRICES_PENCE.essentials.month).toBe(1900);
    expect(PLAN_PRICES_PENCE.premium.year).toBe(29000);
  });
});
