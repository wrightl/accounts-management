"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { platformRunDailyCron } from "@/actions/platform";

export function RunDailyCronButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  return (
    <div>
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={() => {
          setError(null);
          setOk(false);
          start(async () => {
            const result = await platformRunDailyCron();
            if (!result.ok) setError(result.error);
            else {
              setOk(true);
              router.refresh();
            }
          });
        }}
      >
        {pending ? "Running…" : "Run daily cron now"}
      </Button>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      {ok ? <p className="mt-2 text-sm text-green-700">Cron finished.</p> : null}
    </div>
  );
}
