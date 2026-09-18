"use client";

import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useAlert } from "@/components/ui/alert-dialog";
import { FieldError, Input, Label, Textarea } from "@/components/ui/form";
import { FormStickyActions } from "@/components/ui/form-sticky-actions";
import { scheduleFocusFirstFieldError } from "@/components/ui/focus-first-field-error";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import { createClient, updateClient, deleteClient } from "@/actions/clients";
import {
  clientRawFromFormData,
  parseClientInput,
} from "@/lib/clients/schema";

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
    <form ref={formRef} noValidate onSubmit={preventResetSubmit(onSubmit)} className="mx-auto max-w-xl space-y-4">
      <div>
        <Label htmlFor="companyName">Company name (optional)</Label>
        <Input
          id="companyName"
          name="companyName"
          defaultValue={client?.companyName ?? ""}
          disabled={!canWrite || pending}
          aria-invalid={Boolean(fieldErrors.companyName)}
          aria-describedby={
            fieldErrors.companyName ? "companyName-error" : undefined
          }
          onChange={() => clearField("companyName")}
        />
        <FieldError id="companyName-error">{fieldErrors.companyName}</FieldError>
      </div>
      <div>
        <Label htmlFor="name" required>
          Contact name
        </Label>
        <Input
          id="name"
          name="name"
          required
          defaultValue={client?.name ?? ""}
          disabled={!canWrite || pending}
          aria-invalid={Boolean(fieldErrors.name)}
          aria-describedby={fieldErrors.name ? "name-error" : undefined}
          onChange={() => clearField("name")}
        />
        <FieldError id="name-error">{fieldErrors.name}</FieldError>
      </div>
      <div>
        <Label htmlFor="email">Email (optional)</Label>
        <Input
          id="email"
          name="email"
          type="email"
          defaultValue={client?.email ?? ""}
          disabled={!canWrite || pending}
          aria-invalid={Boolean(fieldErrors.email)}
          aria-describedby={fieldErrors.email ? "email-error" : undefined}
          onChange={() => clearField("email")}
        />
        <FieldError id="email-error">{fieldErrors.email}</FieldError>
      </div>
      <div>
        <Label htmlFor="addressLines">Address (optional)</Label>
        <Textarea
          id="addressLines"
          name="addressLines"
          rows={3}
          defaultValue={client?.addressLines ?? ""}
          disabled={!canWrite || pending}
          aria-invalid={Boolean(fieldErrors.addressLines)}
          aria-describedby={
            fieldErrors.addressLines ? "addressLines-error" : undefined
          }
          onChange={() => clearField("addressLines")}
        />
        <FieldError id="addressLines-error">{fieldErrors.addressLines}</FieldError>
      </div>
      <div>
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={client?.notes ?? ""}
          disabled={!canWrite || pending}
          aria-invalid={Boolean(fieldErrors.notes)}
          aria-describedby={fieldErrors.notes ? "notes-error" : undefined}
          onChange={() => clearField("notes")}
        />
        <FieldError id="notes-error">{fieldErrors.notes}</FieldError>
      </div>
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
