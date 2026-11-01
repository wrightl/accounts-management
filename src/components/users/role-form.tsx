"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateUserRole } from "@/actions/users";
import { Button } from "@/components/ui/button";
import { FieldError, Select } from "@/components/ui/form";
import { scheduleFocusFirstFieldError } from "@/components/ui/focus-first-field-error";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import {
  assignableRoles,
  roleLabel as labelForRole,
  type TenantRole,
} from "@/lib/roles";
import {
  parseRoleUpdateInput,
  roleUpdateRawFromFormData,
} from "@/lib/users/schema";

export function UserRoleForm({
  userId,
  role,
  roleLabel,
  isSelf,
}: {
  userId: string;
  role: TenantRole;
  roleLabel: string;
  isSelf: boolean;
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

  if (isSelf) {
    return <span className="text-sm text-muted">{roleLabel} (you)</span>;
  }

  return (
    <form
      ref={formRef}
      noValidate
      className="flex flex-wrap items-center gap-2"
      onSubmit={preventResetSubmit((formData) => {
        clearAll();
        const clientParsed = parseRoleUpdateInput(
          roleUpdateRawFromFormData(userId, formData),
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
          const result = await updateUserRole(userId, formData);
          if (applyActionResult(result)) {
            router.refresh();
          } else if (!result.ok) {
            scheduleFocusFirstFieldError(formRef.current, result.fieldErrors);
          }
        });
      })}
    >
      <Select
        name="role"
        defaultValue={role}
        disabled={pending}
        className="w-auto"
        aria-invalid={Boolean(fieldErrors.role)}
        aria-describedby={fieldErrors.role ? "role-error" : undefined}
        onChange={() => clearField("role")}
      >
        {assignableRoles(role).map((value) => (
          <option key={value} value={value}>
            {labelForRole(value)}
          </option>
        ))}
      </Select>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      <FieldError id="role-error">{fieldErrors.role}</FieldError>
      <FieldError>{error}</FieldError>
    </form>
  );
}
