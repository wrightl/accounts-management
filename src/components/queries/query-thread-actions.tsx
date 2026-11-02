"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { closeQuery, reopenQuery, replyToQuery } from "@/actions/accountant-queries";
import { Button } from "@/components/ui/button";
import { FieldError, Label, Textarea } from "@/components/ui/form";
import { MAX_QUERY_BODY_LENGTH } from "@/lib/queries/schema";
import type { ActionResult } from "@/actions/result";

/** Reply box, plus close and reopen for the accountant. */
export function QueryThreadActions({
  queryId,
  closed,
  canClose,
}: {
  queryId: string;
  closed: boolean;
  canClose: boolean;
}) {
  const router = useRouter();
  const bodyId = useId();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<ActionResult>, onDone?: () => void) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(
          result.fieldErrors
            ? Object.values(result.fieldErrors)[0] ?? result.error
            : result.error,
        );
        return;
      }
      onDone?.();
      router.refresh();
    });
  };

  if (closed) {
    return (
      <div className="mt-6">
        <p className="text-sm text-muted">This query is closed.</p>
        {canClose ? (
          <Button
            type="button"
            variant="secondary"
            className="mt-2"
            disabled={pending}
            onClick={() => run(() => reopenQuery(queryId))}
          >
            Reopen
          </Button>
        ) : null}
        <FieldError>{error}</FieldError>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <Label htmlFor={bodyId}>Reply</Label>
      <Textarea
        id={bodyId}
        rows={4}
        maxLength={MAX_QUERY_BODY_LENGTH}
        value={body}
        disabled={pending}
        onChange={(e) => setBody(e.target.value)}
      />
      <FieldError>{error}</FieldError>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={pending}
          onClick={() => run(() => replyToQuery(queryId, { body }), () => setBody(""))}
        >
          {pending ? "Sending…" : "Send reply"}
        </Button>
        {canClose ? (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => run(() => closeQuery(queryId))}
          >
            Close query
          </Button>
        ) : null}
      </div>
    </div>
  );
}
