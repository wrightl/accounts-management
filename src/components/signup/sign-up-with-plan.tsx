"use client";

import { useEffect, useState } from "react";
import { SignUp } from "@clerk/nextjs";
import { saveSignupPlanChoice } from "@/actions/signup-plan";
import { SignupPlanPicker } from "@/components/signup/plan-picker";
import type { StripeCatalog } from "@/lib/billing/catalog-types";
import type { PricingPlan } from "@/lib/marketing-analytics";

function ClerkSignUp() {
  return (
    <div className="w-full max-w-md">
      <p className="mb-4 text-center text-sm text-white/70">
        Create your account to continue setup.
      </p>
      <SignUp />
    </div>
  );
}

/**
 * When `initialPlan` is set (e.g. pricing plan card), persist the choice and
 * skip the picker. Otherwise the user must choose a tier before Clerk.
 */
export function SignUpWithPlan({
  catalog,
  initialPlan,
}: {
  catalog: StripeCatalog | null;
  initialPlan: PricingPlan | null;
}) {
  const [showClerk, setShowClerk] = useState(false);
  const [persisting, setPersisting] = useState(Boolean(initialPlan));
  const [persistError, setPersistError] = useState<string | null>(null);

  useEffect(() => {
    if (!initialPlan) return;

    let cancelled = false;
    const fd = new FormData();
    fd.set("plan", initialPlan);
    if (initialPlan !== "trial") {
      fd.set("interval", "month");
    }

    void saveSignupPlanChoice(fd).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setPersistError(result.error);
        setPersisting(false);
        return;
      }
      setShowClerk(true);
      setPersisting(false);
    });

    return () => {
      cancelled = true;
    };
  }, [initialPlan]);

  if (persisting) {
    return (
      <p className="text-center text-sm text-white/75" aria-live="polite">
        Starting sign-up…
      </p>
    );
  }

  if (persistError) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-4">
        <p className="text-center text-sm text-red-200" role="alert">
          {persistError}
        </p>
        <SignupPlanPicker
          catalog={catalog}
          initialPlan={initialPlan}
          onConfirmed={() => setShowClerk(true)}
        />
      </div>
    );
  }

  if (!showClerk) {
    return (
      <SignupPlanPicker
        catalog={catalog}
        initialPlan={initialPlan}
        onConfirmed={() => setShowClerk(true)}
      />
    );
  }

  return <ClerkSignUp />;
}
