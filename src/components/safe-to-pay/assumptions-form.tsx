"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { saveSafeToPaySettings } from "@/actions/safe-to-pay";
import { Button } from "@/components/ui/button";
import { FieldError, Label, Select } from "@/components/ui/form";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { useFieldErrors } from "@/components/ui/use-field-errors";

export function SafeToPayAssumptionsForm({
  vatRegistered,
  vatQuarterEndMonth,
  bufferMonths,
}: {
  vatRegistered: boolean;
  vatQuarterEndMonth: number;
  bufferMonths: number;
}) {
  const router = useRouter();
  const { fieldErrors, error, clearAll, applyActionResult } = useFieldErrors();
  const [pending, startTransition] = useTransition();

  return (
    <form
      noValidate
      className="flex flex-wrap items-end gap-4"
      onSubmit={preventResetSubmit((formData) => {
        clearAll();
        startTransition(async () => {
          const result = await saveSafeToPaySettings(formData);
          if (applyActionResult(result)) router.refresh();
        });
      })}
    >
      {vatRegistered ? (
        <div>
          <Label htmlFor="vatQuarterEndMonth">VAT quarters end in</Label>
          <Select
            id="vatQuarterEndMonth"
            name="vatQuarterEndMonth"
            defaultValue={String(vatQuarterEndMonth)}
            disabled={pending}
          >
            <option value="3">March, June, September, December</option>
            <option value="1">January, April, July, October</option>
            <option value="2">February, May, August, November</option>
          </Select>
          <FieldError>{fieldErrors.vatQuarterEndMonth}</FieldError>
        </div>
      ) : (
        <input type="hidden" name="vatQuarterEndMonth" value={vatQuarterEndMonth} />
      )}
      <div>
        <Label htmlFor="bufferMonths">Keep back</Label>
        <Select
          id="bufferMonths"
          name="bufferMonths"
          defaultValue={String(bufferMonths)}
          disabled={pending}
        >
          <option value="0">No buffer</option>
          <option value="1">1 month of spending</option>
          <option value="2">2 months of spending</option>
          <option value="3">3 months of spending</option>
          <option value="6">6 months of spending</option>
        </Select>
        <FieldError>{fieldErrors.bufferMonths}</FieldError>
      </div>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Saving…" : "Update"}
      </Button>
      <FieldError>{error}</FieldError>
    </form>
  );
}
