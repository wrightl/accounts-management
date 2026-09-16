"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { revokeUserInvite } from "@/actions/users";
import { Button } from "@/components/ui/button";
import { useAlert } from "@/components/ui/alert-dialog";

export function RevokeInviteButton({
  userId,
  email,
  redirectTo,
  variant = "ghost",
  appearance = "button",
  className,
}: {
  userId: string;
  email: string;
  redirectTo?: string;
  variant?: "ghost" | "secondary";
  appearance?: "button" | "link";
  className?: string;
}) {
  const router = useRouter();
  const { confirm, alert } = useAlert();
  const [pending, setPending] = useState(false);

  async function onRevoke() {
    const ok = await confirm({
      title: "Revoke invitation",
      message: `Revoke the invitation for ${email}? They will no longer be able to sign up with this invite.`,
      confirmLabel: "Revoke",
      variant: "destructive",
    });
    if (!ok) return;

    setPending(true);
    try {
      const result = await revokeUserInvite(userId);
      if (!result.ok) {
        setPending(false);
        await alert({
          title: "Couldn't revoke invitation",
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
          onClick={onRevoke}
          className="text-sm text-red-600 hover:underline disabled:opacity-50"
        >
          {pending ? "Revoking…" : "Revoke"}
        </button>
      ) : (
        <Button type="button" variant={variant} disabled={pending} onClick={onRevoke}>
          {pending ? "Revoking…" : "Revoke"}
        </Button>
      )}
    </span>
  );
}
