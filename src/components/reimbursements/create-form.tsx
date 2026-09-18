"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select } from "@/components/ui/form";
import { FormStickyActions } from "@/components/ui/form-sticky-actions";
import { scheduleFocusFirstFieldError } from "@/components/ui/focus-first-field-error";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import { formatGBP } from "@/lib/money";
import { createReimbursementRun } from "@/actions/reimbursements";
import {
  parseCreateReimbursementInput,
  reimbursementCreateRawFromFormData,
} from "@/lib/reimbursements/schema";

export function CreateReimbursementForm({
  founders,
  expenses,
  initialPayeeUserId,
}: {
  founders: { id: string; name: string | null; email: string }[];
  expenses: {
    id: string;
    description: string;
    amountPence: number;
    spentAt: string | null;
    paidByUserId: string | null;
  }[];
  initialPayeeUserId?: string;
}) {
  const router = useRouter();
  const defaultPayee =
    initialPayeeUserId && founders.some((f) => f.id === initialPayeeUserId)
      ? initialPayeeUserId
      : (founders[0]?.id ?? "");
  const [payeeUserId, setPayeeUserId] = useState(defaultPayee);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reference, setReference] = useState("");
  const {
    fieldErrors,
    error,
    clearAll,
    clearField,
    applyFail,
  } = useFieldErrors();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  const forPayee = useMemo(
    () => expenses.filter((e) => e.paidByUserId === payeeUserId),
    [expenses, payeeUserId],
  );

  const total = useMemo(
    () =>
      forPayee
        .filter((e) => selected.has(e.id))
        .reduce((a, e) => a + e.amountPence, 0),
    [forPayee, selected],
  );

  return (
    <form
      ref={formRef}
      noValidate
      className="space-y-4"
      onSubmit={preventResetSubmit((formData) => {
        formData.set("expenseIdsJson", JSON.stringify([...selected]));
        formData.set("payeeUserId", payeeUserId);
        formData.set("reference", reference);
        clearAll();
        const raw = reimbursementCreateRawFromFormData(formData);
        if (!raw.ok) {
          applyFail(raw);
          scheduleFocusFirstFieldError(formRef.current, raw.fieldErrors);
          return;
        }
        const clientParsed = parseCreateReimbursementInput(raw.data);
        if (!clientParsed.ok) {
          applyFail(clientParsed);
          scheduleFocusFirstFieldError(
            formRef.current,
            clientParsed.fieldErrors,
          );
          return;
        }
        startTransition(async () => {
          const result = await createReimbursementRun(formData);
          if (!result.ok) {
            applyFail(result);
            scheduleFocusFirstFieldError(formRef.current, result.fieldErrors);
            return;
          }
          clearAll();
          router.push(`/reimbursements/${result.id}`);
          router.refresh();
        });
      })}
    >
      <div>
        <Label htmlFor="payeeUserId" required>
          Payee (founder)
        </Label>
        <Select
          id="payeeUserId"
          name="payeeUserId"
          value={payeeUserId}
          onChange={(e) => {
            setPayeeUserId(e.target.value);
            setSelected(new Set());
            clearField("payeeUserId");
          }}
          disabled={pending}
          aria-invalid={Boolean(fieldErrors.payeeUserId)}
          aria-describedby={
            fieldErrors.payeeUserId ? "payeeUserId-error" : undefined
          }
        >
          {founders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name || f.email}
            </option>
          ))}
        </Select>
        <FieldError id="payeeUserId-error">{fieldErrors.payeeUserId}</FieldError>
      </div>

      <div>
        <Label required>Reimbursable expenses</Label>
        {forPayee.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            No reimbursable expenses for this founder.
          </p>
        ) : (
          <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto rounded-lg border border-border p-3">
            {forPayee.map((e) => (
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

      <p className="text-sm text-muted">Total: {formatGBP(total)}</p>
      <FormStickyActions error={error}>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create reimbursement run"}
        </Button>
      </FormStickyActions>
    </form>
  );
}
