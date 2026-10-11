"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveReminderSettings } from "@/actions/reminders";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/form";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import { REMINDER_STEP_OPTIONS, reminderStepLabel } from "@/lib/reminders/schedule";

export function ReminderSettingsForm({
  remindersEnabled,
  schedule,
  latePaymentCharges,
  exampleCharge,
}: {
  remindersEnabled: boolean;
  schedule: number[];
  latePaymentCharges: boolean;
  /** Worked example of the statutory charges, for the explanation. */
  exampleCharge: string;
}) {
  const router = useRouter();
  const { fieldErrors, error, clearAll, clearField, applyActionResult } = useFieldErrors();
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(remindersEnabled);
  const [saved, setSaved] = useState(false);
  const before = REMINDER_STEP_OPTIONS.filter((s) => s < 0);
  const after = REMINDER_STEP_OPTIONS.filter((s) => s > 0);

  // A plain function, not a component, so ticked boxes survive re-renders.
  function stepBoxes(steps: readonly number[]) {
    return (
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {steps.map((step) => (
          <label key={step} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="reminderStep"
              value={step}
              defaultChecked={schedule.includes(step)}
              disabled={pending || !enabled}
              onChange={() => clearField("reminderStep")}
            />
            {reminderStepLabel(step)}
          </label>
        ))}
      </div>
    );
  }

  return (
    <form
      noValidate
      className="max-w-2xl space-y-6"
      onSubmit={preventResetSubmit((formData) => {
        clearAll();
        setSaved(false);
        startTransition(async () => {
          const result = await saveReminderSettings(formData);
          if (applyActionResult(result)) {
            setSaved(true);
            router.refresh();
          }
        });
      })}
    >
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="remindersEnabled"
          value="on"
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked);
            clearField("reminderStep");
          }}
          disabled={pending}
          className="mt-1"
        />
        <span>
          <span className="font-medium text-foreground">Send payment reminders</span>
          <span className="mt-0.5 block text-xs text-muted">
            Emailed to the client with a link to view and pay the invoice. Each reminder is
            sent once per invoice, and they stop as soon as it&apos;s paid.
          </span>
        </span>
      </label>

      <fieldset className="space-y-4" aria-describedby="reminderStep-error">
        <legend className="text-sm font-medium">When to remind</legend>
        <div>
          <p className="mb-2 text-xs text-muted">Before the due date</p>
          {stepBoxes(before)}
        </div>
        <div>
          <p className="mb-2 text-xs text-muted">After the due date</p>
          {stepBoxes(after)}
        </div>
        <FieldError id="reminderStep-error">{fieldErrors.reminderStep}</FieldError>
      </fieldset>

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="latePaymentCharges"
          value="on"
          defaultChecked={latePaymentCharges}
          disabled={pending}
          className="mt-1"
        />
        <span>
          <span className="font-medium text-foreground">
            Add statutory late payment charges to overdue reminders
          </span>
          <span className="mt-0.5 block text-xs text-muted">
            Business clients can be charged interest at 8% over the Bank of England base rate,
            plus fixed compensation of £40, £70 or £100 depending on the amount, under the Late
            Payment of Commercial Debts (Interest) Act 1998. Overdue reminders state the
            interest so far. {exampleCharge} It doesn&apos;t apply to consumers.
          </span>
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save reminders"}
        </Button>
        {saved ? <span className="text-sm text-muted">Saved.</span> : null}
      </div>
      <FieldError>{error}</FieldError>
    </form>
  );
}
