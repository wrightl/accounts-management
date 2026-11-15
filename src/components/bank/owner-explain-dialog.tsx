"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { explainOwnerTransactionsAction, getOwnerExplainContextAction } from "@/actions/bank";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { FieldError, Label, Select, Textarea } from "@/components/ui/form";

type Context = { soleTrader: boolean; people: { id: string; name: string }[] };

/**
 * Mark a bank transaction as money between the business and its people: a sole
 * trader's drawings or money put in, or a limited company's salary payment.
 */
export function OwnerExplainDialog({
  open,
  onClose,
  transactionId,
  incoming,
}: {
  open: boolean;
  onClose: () => void;
  transactionId: string;
  /** Money came in, rather than went out. */
  incoming: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [context, setContext] = useState<Context | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [personUserId, setPersonUserId] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    let cancelled = false;
    void getOwnerExplainContextAction().then((result) => {
      if (cancelled) return;
      if (result.ok) setContext(result);
      else setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // What this kind of business can mark a transaction in this direction as, if anything.
  const matchType = !context
    ? null
    : context.soleTrader
      ? incoming
        ? "money_put_in"
        : "drawings"
      : incoming
        ? null
        : "salary";
  const title =
    matchType === "drawings"
      ? "Mark as drawings"
      : matchType === "money_put_in"
        ? "Mark as money put in"
        : matchType === "salary"
          ? "Mark as salary"
          : "Not an expense";

  const handleClose = () => {
    if (!pending) onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} title={title}>
      {!context && !error ? <p className="text-sm text-muted">Loading…</p> : null}
      {context && !matchType ? (
        <p className="text-sm text-muted">
          Money a director pays into a limited company belongs on the Director&apos;s loans page.
          Use Explain to mark this as other income, a transfer, or tax or loan.
        </p>
      ) : null}
      {matchType ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            {matchType === "drawings"
              ? "Money you took out of the business for yourself. It is not a business expense, and is totalled in the year-end pack."
              : matchType === "money_put_in"
                ? "Your own money paid into the business. It is not income, and is totalled in the year-end pack."
                : "Pay to a director or employee. The year-end pack totals it per person. Tax and National Insurance are not recorded here."}
          </p>
          {matchType === "salary" ? (
            <div>
              <Label htmlFor="owner-explain-person">Paid to</Label>
              <Select
                id="owner-explain-person"
                value={personUserId}
                disabled={pending}
                onChange={(e) => setPersonUserId(e.target.value)}
              >
                <option value="">Choose a person</option>
                {context!.people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <div>
            <Label htmlFor="owner-explain-note">Note (optional)</Label>
            <Textarea
              id="owner-explain-note"
              rows={2}
              value={note}
              disabled={pending}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
      ) : null}
      <FieldError>{error}</FieldError>
      <DialogActions>
        <Button type="button" variant="ghost" disabled={pending} onClick={handleClose}>
          {matchType ? "Cancel" : "Close"}
        </Button>
        {matchType ? (
          <Button
            type="button"
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await explainOwnerTransactionsAction({
                  transactionIds: [transactionId],
                  matchType,
                  personUserId: personUserId || null,
                  note: note.trim() || null,
                });
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                router.refresh();
                onClose();
              });
            }}
          >
            {pending ? "Saving…" : "Save"}
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}
