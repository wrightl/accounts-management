"use client";

import { useRef, useTransition } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/actions/clients";
import { ClientFields } from "@/components/clients/client-fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/form";
import { scheduleFocusFirstFieldError } from "@/components/ui/focus-first-field-error";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import { clientDisplayName } from "@/lib/clients/display";
import { clientRawFromFormData, parseClientInput } from "@/lib/clients/schema";

export type CreatedClient = { id: string; name: string; companyName: string | null; label: string };

/**
 * Create a client without leaving the current form. Rendered into the body so
 * its form isn't nested inside the page's.
 */
export function NewClientDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (client: CreatedClient) => void;
}) {
  const { fieldErrors, error, clearAll, clearField, applyFail, applyActionResult } =
    useFieldErrors();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    clearAll();
    formRef.current?.reset();
    onClose();
  }

  function onSubmit(formData: FormData) {
    clearAll();
    const parsed = parseClientInput(clientRawFromFormData(formData));
    if (!parsed.ok) {
      applyFail(parsed);
      scheduleFocusFirstFieldError(formRef.current, parsed.fieldErrors);
      return;
    }
    startTransition(async () => {
      const result = await createClient(formData);
      if (!applyActionResult(result) || !result.ok) {
        if (!result.ok) scheduleFocusFirstFieldError(formRef.current, result.fieldErrors);
        return;
      }
      if (!result.id) return;
      onCreated({
        id: result.id,
        name: parsed.data.name,
        companyName: parsed.data.companyName,
        label: clientDisplayName(parsed.data),
      });
      formRef.current?.reset();
      onClose();
    });
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <Dialog open={open} onClose={close} title="New client">
      <form
        ref={formRef}
        noValidate
        onSubmit={preventResetSubmit(onSubmit)}
        className="space-y-4"
      >
        <ClientFields
          idPrefix="new-client-"
          disabled={pending}
          fieldErrors={fieldErrors}
          clearField={clearField}
        />
        <FieldError id="new-client-error">{error}</FieldError>
        <DialogActions>
          <Button type="button" variant="ghost" disabled={pending} onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create client"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>,
    document.body,
  );
}
