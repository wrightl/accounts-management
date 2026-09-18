"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { platformRunDailyCron } from "@/actions/platform";
import { toast } from "@/components/ui/toast";

export function RunDailyCronButton() {
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
            const result = await platformRunDailyCron();
            if (!result.ok) setError(result.error);
            else {
              toast("Cron finished.");
              router.refresh();
            }
          });
        }}
      >
        {pending ? "Running…" : "Run daily cron now"}
      </Button>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
