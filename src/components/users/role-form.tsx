"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateUserRole } from "@/actions/users";
import { Button } from "@/components/ui/button";
import { FieldError, Select } from "@/components/ui/form";
import type { Role } from "@/lib/roles";

const OPTIONS: { value: Role; label: string }[] = [
  { value: "pending", label: "Pending access" },
  { value: "user", label: "Co-founder" },
  { value: "accountant", label: "Accountant" },
  { value: "admin", label: "Administrator" },
];

export function UserRoleForm({
  userId,
  role,
  roleLabel,
  isSelf,
}: {
  userId: string;
  role: Role;
  roleLabel: string;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (isSelf) {
    return <span className="text-sm text-muted">{roleLabel} (you)</span>;
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          const result = await updateUserRole(userId, formData);
          if (!result.ok) setError(result.error);
          else router.refresh();
        });
      }}
    >
      <Select name="role" defaultValue={role} disabled={pending} className="w-auto">
        {OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </Select>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      <FieldError>{error}</FieldError>
    </form>
  );
}
