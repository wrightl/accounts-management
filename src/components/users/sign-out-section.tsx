"use client";

import { useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export function SignOutSection() {
  const { signOut } = useClerk();
  const [pending, setPending] = useState(false);

  return (
    <section className="border-t border-border pt-8">
      <h2 className="font-display text-lg font-semibold">Session</h2>
      <p className="mt-1 text-sm text-muted">
        Sign out of this device. You can sign back in anytime.
      </p>
      <div className="mt-4">
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            try {
              await signOut({ redirectUrl: "/" });
            } catch {
              setPending(false);
            }
          }}
        >
          {pending ? "Signing out…" : "Sign out"}
        </Button>
      </div>
    </section>
  );
}
