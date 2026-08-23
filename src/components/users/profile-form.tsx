"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateOwnProfile } from "@/actions/users";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/form";
import { roleLabel, type Role } from "@/lib/roles";

export function ProfileForm({
  email,
  name,
  role,
}: {
  email: string;
  name: string | null;
  role: Role;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateOwnProfile(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <form action={onSubmit} className="space-y-4">
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
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={name ?? ""}
          disabled={pending}
          placeholder="Optional"
        />
      </div>
      <div>
        <Label htmlFor="role">Role</Label>
        <Input id="role" name="role" defaultValue={roleLabel(role)} readOnly disabled />
      </div>
      <FieldError>{error}</FieldError>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
