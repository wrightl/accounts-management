"use server";

import { cookies } from "next/headers";
import type { ActionResult } from "@/actions/result";
import {
  SIGNUP_PLAN_COOKIE,
  SIGNUP_PLAN_COOKIE_MAX_AGE,
  serializeSignupPlanCookie,
  signupPlanChoiceSchema,
  type SignupPlanChoice,
} from "@/lib/signup-plan";

export async function saveSignupPlanChoice(
  formData: FormData,
): Promise<ActionResult> {
  const plan = formData.get("plan");
  const interval = formData.get("interval");
  const raw =
    plan === "trial"
      ? { plan: "trial" as const }
      : { plan, interval: interval || "month" };

  const parsed = signupPlanChoiceSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Choose a subscription tier to continue." };
  }

  await writeSignupPlanCookie(parsed.data);
  return { ok: true, id: parsed.data.plan };
}

export async function writeSignupPlanCookie(
  choice: SignupPlanChoice,
): Promise<void> {
  const jar = await cookies();
  jar.set(SIGNUP_PLAN_COOKIE, serializeSignupPlanCookie(choice), {
    path: "/",
    maxAge: SIGNUP_PLAN_COOKIE_MAX_AGE,
    sameSite: "lax",
    httpOnly: true,
  });
}

export async function clearSignupPlanCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SIGNUP_PLAN_COOKIE);
}
