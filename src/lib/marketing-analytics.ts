export const SIGN_UP_PATH = "/sign-up";

export const PRICING_CTA_EVENT = "pricing_cta";
export const PRICING_FAQ_EVENT = "pricing_faq_open";

export type PricingCtaLocation =
  | "hero"
  | "header"
  | "plan_card"
  | "final_cta"
  | "footer";

export type PricingPlan = "trial" | "essentials" | "premium";

export function signUpHref(opts?: {
  from?: string;
  plan?: PricingPlan;
}): string {
  if (!opts?.from && !opts?.plan) return SIGN_UP_PATH;
  const params = new URLSearchParams();
  if (opts.from) params.set("from", opts.from);
  if (opts.plan) params.set("plan", opts.plan);
  return `${SIGN_UP_PATH}?${params.toString()}`;
}
