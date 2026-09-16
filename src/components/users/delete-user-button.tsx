"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteUser } from "@/actions/users";
import { Button } from "@/components/ui/button";
import { useAlert } from "@/components/ui/alert-dialog";

export function DeleteUserButton({
  userId,
  email,
  invited,
  redirectTo,
  pendingReimbursementCount = 0,
  variant = "ghost",
  appearance = "button",
  className,
}: {
  userId: string;
  email: string;
  invited?: boolean;
  redirectTo?: string;
  pendingReimbursementCount?: number;
  variant?: "ghost" | "secondary";
  appearance?: "button" | "link";
  className?: string;
}) {
  const router = useRouter();
  const { confirm, alert } = useAlert();
  const [pending, setPending] = useState(false);

  async function onDelete() {
    const base = invited
      ? `Delete the invitation for ${email}? They will no longer be able to sign up with this invite.`
      : `Delete ${email}? They will lose access immediately.`;
    const pendingNote =
      pendingReimbursementCount > 0
        ? ` Their ${pendingReimbursementCount} pending reimbursement run${
            pendingReimbursementCount === 1 ? "" : "s"
          } will be cancelled. Those expenses will stay reimbursable.`
        : "";

    const ok = await confirm({
      title: invited ? "Delete invited user" : "Delete user",
      message: `${base}${pendingNote}`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;

    setPending(true);
    try {
      const result = await deleteUser(userId);
      if (!result.ok) {
        setPending(false);
        await alert({
          title: "Couldn't delete user",
          message: result.error,
        });
        return;
      }
      if (redirectTo) router.push(redirectTo);
      router.refresh();
    } finally {
      setPending(false);
    }
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
    </span>
  );
}
