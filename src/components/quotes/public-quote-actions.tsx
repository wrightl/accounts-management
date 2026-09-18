"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  acceptPublicQuote,
  declinePublicQuote,
} from "@/actions/public-quotes";
import { Button } from "@/components/ui/button";
import { FieldError, Label, Textarea } from "@/components/ui/form";

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
  const [error, setError] = useState<string | null>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [narrative, setNarrative] = useState("");
  const [done, setDone] = useState<"accepted" | "declined" | null>(null);

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
            setError(null);
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
          onClick={() => setDeclineOpen(true)}
        >
          Decline
        </Button>
      </div>

      {declineOpen ? (
        <div className="space-y-3 rounded-xl border border-border bg-wash/40 p-4">
          <div>
            <Label htmlFor="decline-narrative">Optional message</Label>
            <Textarea
              id="decline-narrative"
              rows={3}
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              disabled={pending}
              placeholder="Let them know why (optional)"
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => {
                setError(null);
                const fd = new FormData();
                fd.set("narrative", narrative);
                startTransition(async () => {
                  const result = await declinePublicQuote(token, fd);
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  setDone("declined");
                  router.refresh();
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
