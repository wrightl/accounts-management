"use client";

import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { inviteUser, updateUser } from "@/actions/users";
import { RevokeInviteButton } from "@/components/users/revoke-invite-button";
import { DeleteUserButton } from "@/components/users/delete-user-button";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select } from "@/components/ui/form";
import { FormStickyActions } from "@/components/ui/form-sticky-actions";
import { scheduleFocusFirstFieldError } from "@/components/ui/focus-first-field-error";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import type { TenantRole } from "@/lib/roles";
import {
  inviteUserRawFromFormData,
  parseInviteUserInput,
  parseUpdateUserInput,
  updateUserRawFromFormData,
} from "@/lib/users/schema";

const ROLE_OPTIONS: { value: TenantRole; label: string }[] = [
  { value: "pending", label: "Pending access" },
  { value: "user", label: "Co-founder" },
  { value: "accountant", label: "Accountant" },
  { value: "admin", label: "Administrator" },
];

type EditUser = {
  id: string;
  email: string;
  name: string | null;
  role: TenantRole;
  clerkUserId: string | null;
};

export function UserForm({
  mode,
  user,
  isSelf,
  pendingReimbursementCount = 0,
}: {
  mode: "invite" | "edit";
  user?: EditUser;
  isSelf?: boolean;
  pendingReimbursementCount?: number;
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

  const emailReadOnly = mode === "edit" && Boolean(user?.clerkUserId);

  function onSubmit(formData: FormData) {
    clearAll();
    if (isSelf && user?.role) {
      formData.set("role", user.role);
    }
    const clientParsed =
      mode === "invite"
        ? parseInviteUserInput(inviteUserRawFromFormData(formData))
        : parseUpdateUserInput(updateUserRawFromFormData(user!.id, formData));
    if (!clientParsed.ok) {
      applyFail(clientParsed);
      scheduleFocusFirstFieldError(formRef.current, clientParsed.fieldErrors);
      return;
    }
    startTransition(async () => {
      const result =
        mode === "invite"
          ? await inviteUser(formData)
          : await updateUser(user!.id, formData);
      if (!applyActionResult(result)) {
        if (!result.ok) {
          scheduleFocusFirstFieldError(formRef.current, result.fieldErrors);
        }
        return;
      }
      router.push("/users");
      router.refresh();
    });
  }

  return (
    <form ref={formRef} noValidate onSubmit={preventResetSubmit(onSubmit)} className="mx-auto max-w-xl space-y-4">
      <div>
        <Label htmlFor="email" required={mode === "invite"}>
          Email
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          required={mode === "invite"}
          defaultValue={user?.email ?? ""}
          readOnly={emailReadOnly}
          disabled={pending || emailReadOnly}
          aria-invalid={Boolean(fieldErrors.email)}
          aria-describedby={fieldErrors.email ? "email-error" : undefined}
          onChange={() => clearField("email")}
        />
        {emailReadOnly && (
          <p className="mt-1 text-xs text-muted">
            Email is managed by Clerk for signed-in users.
          </p>
        )}
        <FieldError id="email-error">{fieldErrors.email}</FieldError>
      </div>
      <div>
        <Label htmlFor="name">Name (optional)</Label>
        <Input
          id="name"
          name="name"
          defaultValue={user?.name ?? ""}
          disabled={pending}
          aria-invalid={Boolean(fieldErrors.name)}
          aria-describedby={fieldErrors.name ? "name-error" : undefined}
          onChange={() => clearField("name")}
        />
        <FieldError id="name-error">{fieldErrors.name}</FieldError>
      </div>
      <div>
        <Label htmlFor="role" required>
          Role
        </Label>
        <Select
          id="role"
          name="role"
          defaultValue={user?.role ?? "pending"}
          disabled={pending || isSelf}
          aria-invalid={Boolean(fieldErrors.role)}
          aria-describedby={fieldErrors.role ? "role-error" : undefined}
          onChange={() => clearField("role")}
        >
          {ROLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
        {isSelf && (
          <p className="mt-1 text-xs text-muted">You cannot change your own role.</p>
        )}
        <FieldError id="role-error">{fieldErrors.role}</FieldError>
      </div>
      <FormStickyActions error={error}>
        <Button type="submit" disabled={pending}>
          {pending
            ? mode === "invite"
              ? "Sending…"
              : "Saving…"
            : mode === "invite"
              ? "Send invitation"
              : "Save changes"}
        </Button>
        {mode === "edit" && user && !isSelf ? (
          user.clerkUserId ? (
            <DeleteUserButton
              userId={user.id}
              email={user.email}
              redirectTo="/users"
              pendingReimbursementCount={pendingReimbursementCount}
            />
          ) : (
            <RevokeInviteButton
              userId={user.id}
              email={user.email}
              redirectTo="/users"
            />
          )
        ) : null}
      </FormStickyActions>
    </form>
  );
}
