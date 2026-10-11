"use client";

import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { Lock, LockOpen } from "lucide-react";
import { setBooksLock } from "@/actions/period-lock";
import { Button } from "@/components/ui/button";
import { useAlert } from "@/components/ui/alert-dialog";
import { FieldError, Input, Label } from "@/components/ui/form";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import { formatIsoDateUk } from "@/lib/dates";

export function PeriodLockCard({
  lockedThrough,
  suggestedDate,
  maxDate,
  canLock,
}: {
  lockedThrough: string | null;
  /** Prefill when nothing is locked yet: the end of the last financial year. */
  suggestedDate: string;
  /** Latest date that can be locked (yesterday). */
  maxDate: string;
  canLock: boolean;
}) {
  const router = useRouter();
  const { confirm } = useAlert();
  const { fieldErrors, error, clearAll, clearField, applyActionResult } = useFieldErrors();
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function submit(formData: FormData) {
    clearAll();
    startTransition(async () => {
      const result = await setBooksLock(formData);
      if (applyActionResult(result) && result.ok) router.refresh();
    });
  }

  async function onUnlock() {
    const ok = await confirm({
      title: "Remove the lock",
      message:
        "Anyone with edit access will be able to change past invoices, expenses and payments again. The change is recorded in the audit log.",
      confirmLabel: "Remove lock",
      variant: "destructive",
    });
    if (!ok) return;
    const formData = new FormData();
    formData.set("lockedThrough", "");
    submit(formData);
  }

  return (
    <section className="mt-10 rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-start gap-3">
        {lockedThrough ? (
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-foreground" aria-hidden />
        ) : (
          <LockOpen className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-semibold">
            {lockedThrough
              ? `Books locked up to ${formatIsoDateUk(lockedThrough)}`
              : "Books are open"}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {lockedThrough
              ? "Invoices, credit notes, expenses, payments, dividends and bank reconciliations dated on or before this date can't be added, changed or removed."
              : "Lock the books once your accountant has filed, so figures they reported can't change by accident."}
          </p>

          {canLock ? (
            <form
              ref={formRef}
              noValidate
              onSubmit={preventResetSubmit(submit)}
              className="mt-4 flex flex-wrap items-end gap-3"
            >
              <div>
                <Label htmlFor="lockedThrough">
                  {lockedThrough ? "Move lock to" : "Lock up to and including"}
                </Label>
                <Input
                  id="lockedThrough"
                  name="lockedThrough"
                  type="date"
                  max={maxDate}
                  defaultValue={lockedThrough ?? suggestedDate}
                  disabled={pending}
                  aria-invalid={Boolean(fieldErrors.lockedThrough)}
                  aria-describedby={
                    fieldErrors.lockedThrough ? "lockedThrough-error" : undefined
                  }
                  onChange={() => clearField("lockedThrough")}
                />
              </div>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : lockedThrough ? "Move lock" : "Lock books"}
              </Button>
              {lockedThrough ? (
                <Button type="button" variant="ghost" disabled={pending} onClick={onUnlock}>
                  Remove lock
                </Button>
              ) : null}
            </form>
          ) : null}
          <FieldError id="lockedThrough-error">{fieldErrors.lockedThrough ?? error}</FieldError>
        </div>
      </div>
    </section>
  );
}
