"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { startDataOnboarding } from "@/actions/data-onboarding";
import { Button } from "@/components/ui/button";

/** Bring the hidden history checklist back to the dashboard. */
export function ReopenDataOnboardingButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await startDataOnboarding();
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.push("/dashboard#data-setup");
          })
        }
      >
        Open the checklist
      </Button>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
