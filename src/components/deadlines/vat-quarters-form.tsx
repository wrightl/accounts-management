"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { saveVatQuarterStagger } from "@/actions/deadlines";
import { Button } from "@/components/ui/button";
import { FieldError, Label, Select } from "@/components/ui/form";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { useFieldErrors } from "@/components/ui/use-field-errors";

export function VatQuartersForm({ vatQuarterEndMonth }: { vatQuarterEndMonth: number }) {
  const router = useRouter();
  const { fieldErrors, error, clearAll, applyActionResult } = useFieldErrors();
  const [pending, startTransition] = useTransition();

  return (
    <form
      noValidate
      className="flex flex-wrap items-end gap-3"
      onSubmit={preventResetSubmit((formData) => {
        clearAll();
        startTransition(async () => {
          const result = await saveVatQuarterStagger(formData);
          if (applyActionResult(result)) router.refresh();
        });
      })}
    >
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
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Saving…" : "Update"}
      </Button>
      <FieldError>{error}</FieldError>
    </form>
  );
}
