"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  acceptPublicQuote,
  declinePublicQuote,
} from "@/actions/public-quotes";
import { Button } from "@/components/ui/button";
import { FieldError, Label, Textarea } from "@/components/ui/form";
import { scheduleFocusFirstFieldError } from "@/components/ui/focus-first-field-error";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import {
  parsePublicDeclineQuoteInput,
  publicDeclineQuoteRawFromFormData,
} from "@/lib/quotes/schema";

export function PublicQuoteActions({
  token,
  canRespond,
  expired,
}: {
  token: string;
  canRespond: boolean;
  expired: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const {
    fieldErrors,
    error,
    clearAll,
    clearField,
    applyFail,
    applyActionResult,
    setError,
  } = useFieldErrors();
  const [declineOpen, setDeclineOpen] = useState(false);
  const [narrative, setNarrative] = useState("");
  const [done, setDone] = useState<"accepted" | "declined" | null>(null);
  const declineRef = useRef<HTMLDivElement>(null);

  if (!canRespond || expired) {
    return (
      <p className="text-sm text-muted">
        {expired
          ? "This quote has expired and can no longer be accepted online."
          : "No further action is needed on this quote."}
      </p>
    );
  }

  if (done === "accepted") {
    return (
      <p className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-foreground">
        Thank you — you have accepted this quote. The team will be in touch.
      </p>
    );
  }
  if (done === "declined") {
    return (
      <p className="rounded-xl border border-border bg-wash/40 px-4 py-3 text-sm text-muted">
        You have declined this quote. Thank you for letting us know.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          disabled={pending}
          onClick={() => {
            clearAll();
            startTransition(async () => {
              const result = await acceptPublicQuote(token);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setDone("accepted");
              router.refresh();
            });
          }}
        >
          {pending ? "Working…" : "Accept quote"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => {
            clearAll();
            setDeclineOpen(true);
          }}
        >
          Decline
        </Button>
      </div>

      {declineOpen ? (
        <div
          ref={declineRef}
          className="space-y-3 rounded-xl border border-border bg-wash/40 p-4"
        >
          <div>
            <Label htmlFor="decline-narrative">Optional message</Label>
            <Textarea
              id="decline-narrative"
              rows={3}
              value={narrative}
              onChange={(e) => {
                clearField("narrative");
                setNarrative(e.target.value);
              }}
              disabled={pending}
              placeholder="Let them know why (optional)"
              aria-invalid={Boolean(fieldErrors.narrative)}
              aria-describedby={
                fieldErrors.narrative ? "decline-narrative-error" : undefined
              }
            />
            <FieldError id="decline-narrative-error">{fieldErrors.narrative}</FieldError>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => {
                clearAll();
                const fd = new FormData();
                fd.set("narrative", narrative);
                const clientParsed = parsePublicDeclineQuoteInput(
                  publicDeclineQuoteRawFromFormData(fd),
                );
                if (!clientParsed.ok) {
                  applyFail(clientParsed);
                  scheduleFocusFirstFieldError(
                    declineRef.current,
                    clientParsed.fieldErrors,
                  );
                  return;
                }
                startTransition(async () => {
                  const result = await declinePublicQuote(token, fd);
                  if (applyActionResult(result)) {
                    setDone("declined");
                    router.refresh();
                  } else if (!result.ok) {
                    scheduleFocusFirstFieldError(
                      declineRef.current,
                      result.fieldErrors,
                    );
                  }
                });
              }}
            >
              Confirm decline
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => setDeclineOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <FieldError>{error}</FieldError>
    </div>
  );
}
