import { z } from "zod";
import type { PricingPlan } from "@/lib/marketing-analytics";

export const SIGNUP_PLAN_COOKIE = "alfa_signup_plan";

/** Cookie lifetime: enough to finish Clerk + onboarding. */
export const SIGNUP_PLAN_COOKIE_MAX_AGE = 60 * 60 * 24; // 24h

export const signupPlanChoiceSchema = z.discriminatedUnion("plan", [
  z.object({ plan: z.literal("trial") }),
  z.object({
    plan: z.enum(["essentials", "premium"]),
    interval: z.enum(["month", "year"]),
  }),
]);

export type SignupPlanChoice = z.infer<typeof signupPlanChoiceSchema>;

export function parseSignupPlanQuery(
  plan: string | null | undefined,
): PricingPlan | null {
  if (plan === "trial" || plan === "essentials" || plan === "premium") {
    return plan;
  }
  return null;
}

export function parseSignupPlanCookie(
  raw: string | null | undefined,
): SignupPlanChoice | null {
  if (!raw) return null;
  try {
    const parsed = signupPlanChoiceSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function serializeSignupPlanCookie(choice: SignupPlanChoice): string {
  return JSON.stringify(choice);
}

export function signupPlanLabel(choice: SignupPlanChoice): string {
  switch (choice.plan) {
    case "trial":
      return "Trial";
    case "essentials":
      return choice.interval === "year" ? "Essentials (yearly)" : "Essentials (monthly)";
    case "premium":
      return choice.interval === "year" ? "Premium (yearly)" : "Premium (monthly)";
  }
}
