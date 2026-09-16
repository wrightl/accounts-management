"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { inviteUser, updateUser } from "@/actions/users";
import { RevokeInviteButton } from "@/components/users/revoke-invite-button";
import { DeleteUserButton } from "@/components/users/delete-user-button";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select } from "@/components/ui/form";
import type { TenantRole } from "@/lib/roles";

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
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const emailReadOnly = mode === "edit" && Boolean(user?.clerkUserId);

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result =
        mode === "invite"
          ? await inviteUser(formData)
          : await updateUser(user!.id, formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/users");
      router.refresh();
    });
  }

  return (
    <form action={onSubmit} className="mx-auto max-w-xl space-y-4">
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required={mode === "invite"}
          defaultValue={user?.email ?? ""}
          readOnly={emailReadOnly}
          disabled={pending || emailReadOnly}
        />
        {emailReadOnly && (
          <p className="mt-1 text-xs text-muted">
            Email is managed by Clerk for signed-in users.
          </p>
        )}
      </div>
      <div>
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={user?.name ?? ""}
          disabled={pending}
          placeholder="Optional"
        />
      </div>
      <div>
        <Label htmlFor="role">Role</Label>
        <Select
          id="role"
          name="role"
          defaultValue={user?.role ?? "pending"}
          disabled={pending || isSelf}
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
      </div>
      <FieldError>{error}</FieldError>
      <div className="flex flex-wrap items-center gap-3">
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
      </div>
    </form>
  );
}
