"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { revokeUserInvite } from "@/actions/users";
import { Button } from "@/components/ui/button";
import { useAlert } from "@/components/ui/alert-dialog";
import { FieldError } from "@/components/ui/form";

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
  const { confirm } = useAlert();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onRevoke() {
    const ok = await confirm({
      title: "Revoke invitation",
      message: `Revoke the invitation for ${email}? They will no longer be able to sign up with this invite.`,
      confirmLabel: "Revoke",
      variant: "destructive",
    });
    if (!ok) return;

    setError(null);
    startTransition(async () => {
      const result = await revokeUserInvite(userId);
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
      <FieldError>{error}</FieldError>
    </span>
  );
}
