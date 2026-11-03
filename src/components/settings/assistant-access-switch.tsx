"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setAssistantAccess } from "@/actions/assistant";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/form";

/** The company-wide on/off switch, for admins. */
export function AssistantAccessSwitch({
  enabled,
  companyName,
}: {
  enabled: boolean;
  companyName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function change(next: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await setAssistantAccess(next);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm">
        <span className="font-medium text-foreground">
          {enabled ? "On" : "Off"} for {companyName}.
        </span>{" "}
        <span className="text-muted">
          {enabled
            ? "Anyone in the company who connects an assistant can ask it about these books."
            : "Nobody's assistant can read these books until you turn this on."}
        </span>
      </p>
      <Button
        type="button"
        variant={enabled ? "secondary" : "primary"}
        disabled={pending}
        onClick={() => change(!enabled)}
      >
        {pending ? "Saving…" : enabled ? "Turn off" : "Turn on"}
      </Button>
      <FieldError>{error}</FieldError>
    </div>
  );
}
