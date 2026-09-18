"use client";

import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/form";
import { scheduleFocusFirstFieldError } from "@/components/ui/focus-first-field-error";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import { updateTotalShares } from "@/actions/shareholders";
import {
  parseTotalSharesInput,
  totalSharesRawFromFormData,
} from "@/lib/shareholders/schema";

export function TotalSharesForm({
  totalShares,
  activeShareSum,
  canWrite,
}: {
  totalShares: number | null;
  activeShareSum: number;
  canWrite: boolean;
}) {
  const router = useRouter();
  const {
    fieldErrors,
    error,
    clearAll,
    clearField,
    applyFail,
    applyActionResult,
  } = useFieldErrors();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  if (!canWrite) {
    return (
      <p className="text-sm text-muted">
        Total shares:{" "}
        <span className="font-medium text-foreground">
          {totalShares ?? "not set"}
        </span>
        {totalShares != null && activeShareSum !== totalShares && (
          <span className="text-destructive">
            {" "}
            (active sum {activeShareSum} does not match)
          </span>
        )}
      </p>
    );
  }

  return (
    <form
      ref={formRef}
      noValidate
      className="flex flex-wrap items-end gap-3"
      onSubmit={preventResetSubmit((formData) => {
        clearAll();
        const clientParsed = parseTotalSharesInput(
          totalSharesRawFromFormData(formData),
        );
        if (!clientParsed.ok) {
          applyFail(clientParsed);
          scheduleFocusFirstFieldError(
            formRef.current,
            clientParsed.fieldErrors,
          );
          return;
        }
        startTransition(async () => {
          const result = await updateTotalShares(formData);
          if (applyActionResult(result)) {
            router.refresh();
          } else if (!result.ok) {
            scheduleFocusFirstFieldError(formRef.current, result.fieldErrors);
          }
        });
      })}
    >
      <div>
        <Label htmlFor="totalShares">Total issued shares (optional)</Label>
        <Input
          id="totalShares"
          name="totalShares"
          type="number"
          min={1}
          step={1}
          defaultValue={totalShares ?? (activeShareSum > 0 ? String(activeShareSum) : "")}
          placeholder="e.g. 100"
          disabled={pending}
          aria-invalid={Boolean(fieldErrors.totalShares)}
          aria-describedby={
            fieldErrors.totalShares ? "totalShares-error" : undefined
          }
          onChange={() => clearField("totalShares")}
        />
        <p className="mt-1 text-xs text-muted">
          Active sum: {activeShareSum}
          {totalShares != null && activeShareSum === totalShares
            ? " — balanced"
            : totalShares != null
              ? " — does not match"
              : " — set total to lock the register"}
        </p>
        <FieldError id="totalShares-error">{fieldErrors.totalShares}</FieldError>
      </div>
      <Button type="submit" variant="secondary" disabled={pending}>
        Save total
      </Button>
      <FieldError>{error}</FieldError>
    </form>
  );
}
