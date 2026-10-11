"use client";

import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { addDirectorLoanEntry, deleteDirectorLoanEntry } from "@/actions/ledger";
import { Button } from "@/components/ui/button";
import { useAlert } from "@/components/ui/alert-dialog";
import { FieldError, Input, Label, Select } from "@/components/ui/form";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { scheduleFocusFirstFieldError } from "@/components/ui/focus-first-field-error";
import { useFieldErrors } from "@/components/ui/use-field-errors";

/** Record money a director took out of, or paid into, the company. */
export function DirectorLoanEntryForm({
  directors,
  today,
}: {
  directors: { userId: string; name: string }[];
  today: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const { fieldErrors, error, clearAll, clearField, applyActionResult } = useFieldErrors();
  const [pending, startTransition] = useTransition();

  return (
    <form
      ref={formRef}
      noValidate
      className="space-y-4"
      onSubmit={preventResetSubmit((formData) => {
        clearAll();
        startTransition(async () => {
          const result = await addDirectorLoanEntry(formData);
          if (applyActionResult(result)) {
            formRef.current?.reset();
            router.refresh();
          } else if (!result.ok) {
            scheduleFocusFirstFieldError(formRef.current, result.fieldErrors);
          }
        });
      })}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="directorUserId" required>
            Director
          </Label>
          <Select
            id="directorUserId"
            name="directorUserId"
            defaultValue={directors.length === 1 ? directors[0]!.userId : ""}
            disabled={pending}
            onChange={() => clearField("directorUserId")}
          >
            <option value="">Choose a director</option>
            {directors.map((d) => (
              <option key={d.userId} value={d.userId}>
                {d.name}
              </option>
            ))}
          </Select>
          <FieldError id="directorUserId-error">{fieldErrors.directorUserId}</FieldError>
        </div>
        <div>
          <Label htmlFor="kind" required>
            What happened
          </Label>
          <Select
            id="kind"
            name="kind"
            defaultValue="drawing"
            disabled={pending}
            onChange={() => clearField("kind")}
          >
            <option value="drawing">Director took money out</option>
            <option value="paid_in">Director paid money in</option>
          </Select>
          <FieldError id="kind-error">{fieldErrors.kind}</FieldError>
        </div>
        <div>
          <Label htmlFor="entryDate" required>
            Date
          </Label>
          <Input
            id="entryDate"
            name="entryDate"
            type="date"
            defaultValue={today}
            disabled={pending}
            aria-invalid={Boolean(fieldErrors.entryDate)}
            aria-describedby="entryDate-error"
            onChange={() => clearField("entryDate")}
          />
          <FieldError id="entryDate-error">{fieldErrors.entryDate}</FieldError>
        </div>
        <div>
          <Label htmlFor="amountPounds" required>
            Amount (£)
          </Label>
          <Input
            id="amountPounds"
            name="amountPounds"
            inputMode="decimal"
            placeholder="0.00"
            disabled={pending}
            aria-invalid={Boolean(fieldErrors.amountPounds)}
            aria-describedby="amountPounds-error"
            onChange={() => clearField("amountPounds")}
          />
          <FieldError id="amountPounds-error">{fieldErrors.amountPounds}</FieldError>
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="description">Note (optional)</Label>
          <Input
            id="description"
            name="description"
            placeholder="e.g. Personal purchase on the company card"
            disabled={pending}
          />
        </div>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Add entry"}
      </Button>
      <FieldError>{error}</FieldError>
    </form>
  );
}

export function DeleteDirectorLoanEntryButton({ id }: { id: string }) {
  const router = useRouter();
  const { confirm, alert } = useAlert();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      disabled={pending}
      onClick={async () => {
        const ok = await confirm({
          title: "Delete entry",
          message: "Remove this entry from the director's loan account?",
          confirmLabel: "Delete",
          variant: "destructive",
        });
        if (!ok) return;
        startTransition(async () => {
          const result = await deleteDirectorLoanEntry(id);
          if (!result.ok) {
            await alert({ title: "Couldn't delete", message: result.error });
            return;
          }
          router.refresh();
        });
      }}
    >
      Delete
    </Button>
  );
}
