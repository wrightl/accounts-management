"use client";

import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { updateOwnProfile } from "@/actions/users";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/form";
import { scheduleFocusFirstFieldError } from "@/components/ui/focus-first-field-error";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import { roleLabel, type Role } from "@/lib/roles";
import {
  parseProfileUpdateInput,
  profileUpdateRawFromFormData,
} from "@/lib/users/schema";

export function ProfileForm({
  email,
  name,
  role,
  roleDisplay,
}: {
  email: string;
  name: string | null;
  role: Role;
  /** Override the role field label (e.g. platform operators). */
  roleDisplay?: string;
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

  function onSubmit(formData: FormData) {
    clearAll();
    const clientParsed = parseProfileUpdateInput(
      profileUpdateRawFromFormData(formData),
    );
    if (!clientParsed.ok) {
      applyFail(clientParsed);
      scheduleFocusFirstFieldError(formRef.current, clientParsed.fieldErrors);
      return;
    }
    startTransition(async () => {
      const result = await updateOwnProfile(formData);
      if (!applyActionResult(result)) {
        if (!result.ok) {
          scheduleFocusFirstFieldError(formRef.current, result.fieldErrors);
        }
        return;
      }
      router.refresh();
    });
  }

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={preventResetSubmit(onSubmit)}
      className="space-y-4"
    >
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          defaultValue={email}
          readOnly
          disabled
        />
        <p className="mt-1 text-xs text-muted">
          Email is managed by Clerk for signed-in users.
        </p>
      </div>
      <div>
        <Label htmlFor="name">Name (optional)</Label>
        <Input
          id="name"
          name="name"
          defaultValue={name ?? ""}
          disabled={pending}
          aria-invalid={Boolean(fieldErrors.name)}
          aria-describedby={fieldErrors.name ? "name-error" : undefined}
          onChange={() => clearField("name")}
        />
        <FieldError id="name-error">{fieldErrors.name}</FieldError>
      </div>
      <div>
        <Label htmlFor="role">Role</Label>
        <Input
          id="role"
          name="role"
          defaultValue={roleDisplay ?? roleLabel(role)}
          readOnly
          disabled
        />
      </div>
      <FieldError>{error}</FieldError>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
