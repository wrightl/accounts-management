"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteUser } from "@/actions/users";
import { Button } from "@/components/ui/button";
import { useAlert } from "@/components/ui/alert-dialog";
import { FieldError } from "@/components/ui/form";

export function DeleteUserButton({
  userId,
  email,
  invited,
  redirectTo,
  variant = "ghost",
  appearance = "button",
  className,
}: {
  userId: string;
  email: string;
  invited?: boolean;
  redirectTo?: string;
  variant?: "ghost" | "secondary";
  appearance?: "button" | "link";
  className?: string;
}) {
  const router = useRouter();
  const { confirm } = useAlert();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onDelete() {
    const ok = await confirm({
      title: invited ? "Delete invited user" : "Delete user",
      message: invited
        ? `Delete the invitation for ${email}? They will no longer be able to sign up with this invite.`
        : `Delete ${email}? They will lose access immediately.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;

    setError(null);
    startTransition(async () => {
      const result = await deleteUser(userId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (redirectTo) router.push(redirectTo);
      router.refresh();
    });
  }

  return (
    <span className={className}>
      {appearance === "link" ? (
        <button
          type="button"
          disabled={pending}
          onClick={onDelete}
          className="text-sm text-red-600 hover:underline disabled:opacity-50"
        >
          {pending ? "Deleting…" : "Delete"}
        </button>
      ) : (
        <Button type="button" variant={variant} disabled={pending} onClick={onDelete}>
          {pending ? "Deleting…" : "Delete"}
        </Button>
      )}
      <FieldError>{error}</FieldError>
    </span>
  );
}
