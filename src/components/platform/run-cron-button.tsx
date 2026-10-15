"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { platformRunDailyCron, platformRunInboundDrain } from "@/actions/platform";
import type { ActionResult } from "@/actions/result";
import { toast } from "@/components/ui/toast";

function RunCronButton({
  action,
  label,
  done,
}: {
  action: () => Promise<ActionResult>;
  label: string;
  done: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={() => {
          setError(null);
          start(async () => {
            const result = await action();
            if (!result.ok) setError(result.error);
            else {
              toast(done);
              router.refresh();
            }
          });
        }}
      >
        {pending ? "Running…" : label}
      </Button>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}

export function RunDailyCronButton() {
  return (
    <RunCronButton
      action={platformRunDailyCron}
      label="Run daily cron now"
      done="Daily cron finished."
    />
  );
}

export function RunInboundDrainButton() {
  return (
    <RunCronButton
      action={platformRunInboundDrain}
      label="Run inbound drain now"
      done="Inbound drain finished."
    />
  );
}
