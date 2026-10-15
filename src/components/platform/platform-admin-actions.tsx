"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAlert } from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/toast";
import { removePlatformAdmin, resendPlatformAdminInvite } from "@/actions/platform";

/** Resend / remove controls for one platform operator row. */
export function PlatformAdminActions({
  userId,
  email,
  pendingInvite,
  envLocked,
  isSelf,
}: {
  userId: string;
  email: string;
  pendingInvite: boolean;
  envLocked: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const { confirm, alert } = useAlert();
  const [pending, start] = useTransition();

  if (isSelf) return <span className="text-xs text-muted">You</span>;

  return (
    <div className="flex justify-end gap-2">
      {pendingInvite ? (
        <Button
          type="button"
          variant="secondary"
          className="!px-3 !py-1 text-xs"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const result = await resendPlatformAdminInvite(userId);
              if (result.ok) toast(`Invite re-sent to ${email}.`);
              else void alert({ title: "Couldn't resend invite", message: result.error });
            })
          }
        >
          Resend invite
        </Button>
      ) : null}
      {envLocked ? (
        <span
          className="self-center text-xs text-muted"
          title="Set by the PLATFORM_ADMIN_EMAILS environment variable"
        >
          Env managed
        </span>
      ) : (
        <Button
          type="button"
          variant="ghost"
          className="!px-3 !py-1 text-xs text-red-700"
          disabled={pending}
          onClick={async () => {
            const ok = await confirm({
              title: pendingInvite ? "Cancel invite?" : "Remove platform admin?",
              message: pendingInvite
                ? `${email}'s invitation will be revoked.`
                : `${email} will lose platform access and their account will be deleted.`,
              confirmLabel: pendingInvite ? "Cancel invite" : "Remove admin",
              variant: "destructive",
            });
            if (!ok) return;
            start(async () => {
              const result = await removePlatformAdmin(userId);
              if (result.ok) {
                toast(pendingInvite ? "Invite cancelled." : "Platform admin removed.");
                router.refresh();
              } else {
                void alert({ title: "Couldn't remove admin", message: result.error });
              }
            });
          }}
        >
          {pendingInvite ? "Cancel invite" : "Remove"}
        </Button>
      )}
    </div>
  );
}
