"use client";

import Link from "next/link";
import { track } from "@vercel/analytics";
import {
  PRICING_CTA_EVENT,
  signUpHref,
  type PricingCtaLocation,
  type PricingPlan,
} from "@/lib/marketing-analytics";

type TrackedSignUpLinkProps = {
  location: PricingCtaLocation;
  plan?: PricingPlan;
  from?: string;
  className?: string;
  children: React.ReactNode;
};

export function TrackedSignUpLink({
  location,
  plan,
  from = "pricing",
  className,
  children,
}: TrackedSignUpLinkProps) {
  return (
    <Link
      href={signUpHref({ from, plan })}
      className={className}
      onClick={() => {
        track(PRICING_CTA_EVENT, {
          location,
          ...(plan ? { plan } : {}),
        });
      }}
    >
      {children}
    </Link>
  );
}
