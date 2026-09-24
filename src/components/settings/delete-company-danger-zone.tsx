"use client";

import { useRef, useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { deleteCompany } from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/form";
import { scheduleFocusFirstFieldError } from "@/components/ui/focus-first-field-error";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import { useAlert } from "@/components/ui/alert-dialog";
import { parseDeleteOwnCompanyInput } from "@/lib/settings/schema";

export function DeleteCompanyDangerZone({
  companyName,
}: {
  companyName: string;
}) {
  const { signOut } = useClerk();
  const { confirm, alert } = useAlert();
  const [pending, setPending] = useState(false);
  const {
    fieldErrors,
    error,
    clearAll,
    clearField,
    applyFail,
    applyActionResult,
  } = useFieldErrors();
  const formRef = useRef<HTMLDivElement>(null);
  const [confirmationName, setConfirmationName] = useState("");

  async function onDelete() {
    clearAll();
    const clientParsed = parseDeleteOwnCompanyInput({ confirmationName });
    if (!clientParsed.ok) {
      applyFail(clientParsed);
      scheduleFocusFirstFieldError(formRef.current, clientParsed.fieldErrors);
      return;
    }

    const ok = await confirm({
      title: "Delete company permanently?",
      message: `This permanently deletes ${companyName}, including invoices, expenses, clients, bank data, and member accounts. You will be signed out. This cannot be undone.`,
      confirmLabel: "Delete company",
      variant: "destructive",
    });
    if (!ok) return;

    setPending(true);
    try {
      const result = await deleteCompany(confirmationName);
      if (result.ok) {
        await signOut({ redirectUrl: "/" });
        return;
      }
      applyActionResult(result);
      scheduleFocusFirstFieldError(formRef.current, result.fieldErrors);
      await alert({
        title: "Couldn't delete company",
        message: result.error,
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      ref={formRef}
      className="mt-10 rounded-2xl border border-red-200 bg-red-50/40 p-5"
    >
      <h2 className="font-display text-lg font-semibold text-red-900">
        Delete company
      </h2>
      <p className="mt-1 text-sm text-red-900/80">
        Permanently remove this company, its data, and member accounts (including
        yours). You will be signed out. Type{" "}
        <span className="font-semibold">{companyName}</span> to confirm.
      </p>
      <div className="mt-4 max-w-md">
        <Label htmlFor="deleteCompanyConfirmation" required>
          Company name
        </Label>
        <Input
          id="deleteCompanyConfirmation"
          value={confirmationName}
          onChange={(e) => {
            setConfirmationName(e.target.value);
            clearField("confirmationName");
          }}
          disabled={pending}
          autoComplete="off"
          aria-invalid={Boolean(fieldErrors.confirmationName)}
          aria-describedby={
            fieldErrors.confirmationName
              ? "deleteCompanyConfirmation-error"
              : undefined
          }
        />
        <FieldError id="deleteCompanyConfirmation-error">
          {fieldErrors.confirmationName}
        </FieldError>
      </div>
      <FieldError>{error}</FieldError>
      <Button
        type="button"
        variant="destructive"
        className="mt-4"
        disabled={pending}
        onClick={onDelete}
      >
        {pending ? "Deleting…" : "Delete company"}
      </Button>
    </section>
  );
}
