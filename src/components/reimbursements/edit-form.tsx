"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/form";
import { FormStickyActions } from "@/components/ui/form-sticky-actions";
import { scheduleFocusFirstFieldError } from "@/components/ui/focus-first-field-error";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import { formatGBP } from "@/lib/money";
import { updateReimbursementRun } from "@/actions/reimbursements";
import {
  parseUpdateReimbursementInput,
  reimbursementUpdateRawFromFormData,
} from "@/lib/reimbursements/schema";

export function EditReimbursementForm({
  id,
  payeeLabel,
  expenses,
  initialExpenseIds,
  initialReference,
  initialReimbursementDate,
}: {
  id: string;
  payeeLabel: string;
  expenses: {
    id: string;
    description: string;
    amountPence: number;
    spentAt: string | null;
  }[];
  initialExpenseIds: string[];
  initialReference: string;
  initialReimbursementDate: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(initialExpenseIds));
  const [reference, setReference] = useState(initialReference);
  const [reimbursementDate, setReimbursementDate] = useState(initialReimbursementDate);
  const {
    fieldErrors,
    error,
    clearAll,
    clearField,
    applyFail,
  } = useFieldErrors();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  const total = useMemo(
    () =>
      expenses
        .filter((e) => selected.has(e.id))
        .reduce((a, e) => a + e.amountPence, 0),
    [expenses, selected],
  );

  return (
    <form
      ref={formRef}
      noValidate
      className="max-w-xl space-y-4"
      onSubmit={preventResetSubmit((formData) => {
        formData.set("expenseIdsJson", JSON.stringify([...selected]));
        formData.set("reference", reference);
        formData.set("reimbursementDate", reimbursementDate);
        clearAll();
        const raw = reimbursementUpdateRawFromFormData(formData);
        if (!raw.ok) {
          applyFail(raw);
          scheduleFocusFirstFieldError(formRef.current, raw.fieldErrors);
          return;
        }
        const clientParsed = parseUpdateReimbursementInput(raw.data);
        if (!clientParsed.ok) {
          applyFail(clientParsed);
          scheduleFocusFirstFieldError(
            formRef.current,
            clientParsed.fieldErrors,
          );
          return;
        }
        startTransition(async () => {
          const result = await updateReimbursementRun(id, formData);
          if (!result.ok) {
            applyFail(result);
            scheduleFocusFirstFieldError(formRef.current, result.fieldErrors);
            return;
          }
          clearAll();
          router.push(`/reimbursements/${id}`);
          router.refresh();
        });
      })}
    >
      <div>
        <Label>Payee (founder)</Label>
        <p className="mt-1 text-sm text-foreground">{payeeLabel}</p>
      </div>

      <div>
        <Label required>Reimbursable expenses</Label>
        {expenses.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            No reimbursable expenses available for this founder.
          </p>
        ) : (
          <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto rounded-lg border border-border p-3">
            {expenses.map((e) => (
              <li key={e.id} className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={selected.has(e.id)}
                  onChange={(ev) => {
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (ev.target.checked) next.add(e.id);
                      else next.delete(e.id);
                      return next;
                    });
                    clearField("expenseIds");
                  }}
                  disabled={pending}
                />
                <span className="flex-1">
                  {e.spentAt ?? "—"} · {e.description}
                </span>
                <span className="font-medium">{formatGBP(e.amountPence)}</span>
              </li>
            ))}
          </ul>
        )}
        <FieldError id="expenseIds-error">{fieldErrors.expenseIds}</FieldError>
      </div>

      <div>
        <Label htmlFor="reference" required>
          Bank payment reference
        </Label>
        <Input
          id="reference"
          name="reference"
          value={reference}
          onChange={(e) => {
            setReference(e.target.value);
            clearField("reference");
          }}
          placeholder="Use this reference when transferring from the business account"
          required
          disabled={pending}
          aria-invalid={Boolean(fieldErrors.reference)}
          aria-describedby={
            fieldErrors.reference ? "reference-error" : undefined
          }
        />
        <FieldError id="reference-error">{fieldErrors.reference}</FieldError>
      </div>

      <div>
        <Label htmlFor="reimbursementDate">Reimbursement date</Label>
        <Input
          id="reimbursementDate"
          name="reimbursementDate"
          type="date"
          value={reimbursementDate}
          onChange={(e) => {
            setReimbursementDate(e.target.value);
            clearField("reimbursementDate");
          }}
          disabled={pending}
          aria-invalid={Boolean(fieldErrors.reimbursementDate)}
          aria-describedby={
            fieldErrors.reimbursementDate
              ? "reimbursementDate-error"
              : "reimbursementDate-hint"
          }
        />
        <p id="reimbursementDate-hint" className="mt-1 text-xs text-muted">
          Leave blank to use the day you mark it paid. A linked bank transaction&apos;s
          date takes priority.
        </p>
        <FieldError id="reimbursementDate-error">
          {fieldErrors.reimbursementDate}
        </FieldError>
      </div>

      <p className="text-sm text-muted">Total: {formatGBP(total)}</p>
      <FormStickyActions error={error}>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => router.push(`/reimbursements/${id}`)}
        >
          Cancel
        </Button>
      </FormStickyActions>
    </form>
  );
}
