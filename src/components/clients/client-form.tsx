"use client";

import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useAlert } from "@/components/ui/alert-dialog";
import { ClientFields } from "@/components/clients/client-fields";
import { FormStickyActions } from "@/components/ui/form-sticky-actions";
import { scheduleFocusFirstFieldError } from "@/components/ui/focus-first-field-error";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import { createClient, updateClient, deleteClient } from "@/actions/clients";
import {
  clientRawFromFormData,
  parseClientInput,
} from "@/lib/clients/schema";
import { PAGE_WIDTH } from "@/components/ui/page-width";

export function ClientForm({
  mode,
  client,
  canWrite,
}: {
  mode: "create" | "edit";
  client?: {
    id: string;
    name: string;
    companyName: string | null;
    email: string | null;
    addressLines: string | null;
    notes: string | null;
  };
  canWrite: boolean;
}) {
  const router = useRouter();
  const { confirm } = useAlert();
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

  if (!canWrite && mode === "create") {
    return <p className="text-sm text-muted">You do not have permission to create clients.</p>;
  }

  function onSubmit(formData: FormData) {
    clearAll();
    const clientParsed = parseClientInput(clientRawFromFormData(formData));
    if (!clientParsed.ok) {
      applyFail(clientParsed);
      scheduleFocusFirstFieldError(formRef.current, clientParsed.fieldErrors);
      return;
    }
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createClient(formData)
          : await updateClient(client!.id, formData);
      if (!applyActionResult(result) || !result.ok) {
        if (!result.ok) {
          scheduleFocusFirstFieldError(formRef.current, result.fieldErrors);
        }
        return;
      }
      if (mode === "edit") {
        router.push(`/clients/${client!.id}`);
      } else {
        router.push(result.id ? `/clients/${result.id}` : "/clients");
      }
      router.refresh();
    });
  }

  async function onDelete() {
    if (!client) return;
    const ok = await confirm({
      title: "Delete client",
      message: "Delete this client?",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    clearAll();
    startTransition(async () => {
      const result = await deleteClient(client.id);
      if (!applyActionResult(result)) {
        if (!result.ok) {
          scheduleFocusFirstFieldError(formRef.current, result.fieldErrors);
        }
        return;
      }
      router.push("/clients");
      router.refresh();
    });
  }

  return (
    <form ref={formRef} noValidate onSubmit={preventResetSubmit(onSubmit)} className={`${PAGE_WIDTH.reading} space-y-4`}>
      <ClientFields
        client={client}
        disabled={!canWrite || pending}
        fieldErrors={fieldErrors}
        clearField={clearField}
      />
      {canWrite && (
        <FormStickyActions error={error}>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : mode === "create" ? "Create client" : "Save changes"}
          </Button>
          {mode === "edit" && (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={onDelete}
            >
              Delete
            </Button>
          )}
        </FormStickyActions>
      )}
    </form>
  );
}
