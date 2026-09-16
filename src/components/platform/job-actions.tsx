"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  platformDismissInboundJob,
  platformRetryInboundJob,
  platformRetrySendJob,
} from "@/actions/platform";

export function JobRetryButton({
  kind,
  jobId,
}: {
  kind: "inbound" | "inbound-dismiss" | "send";
  jobId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <Button
        type="button"
        variant={kind === "inbound-dismiss" ? "ghost" : "secondary"}
        className="!px-3 !py-1 text-xs"
        disabled={pending}
        onClick={() => {
          setError(null);
          start(async () => {
            const result =
              kind === "send"
                ? await platformRetrySendJob(jobId)
                : kind === "inbound-dismiss"
                  ? await platformDismissInboundJob(jobId, "Dismissed from platform")
                  : await platformRetryInboundJob(jobId);
            if (!result.ok) setError(result.error);
            else router.refresh();
          });
        }}
      >
        {kind === "inbound-dismiss" ? "Dismiss" : "Retry"}
      </Button>
      {error ? <p className="mt-1 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
