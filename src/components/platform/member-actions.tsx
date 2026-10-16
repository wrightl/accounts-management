"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAlert } from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/toast";
import {
  platformChangeMemberRole,
  platformRemoveCompanyMember,
  platformResendCompanyInvite,
  platformRevokeCompanyInvite,
} from "@/actions/platform";
import { roleLabel, TENANT_ROLES } from "@/lib/roles";
import type { ActionResult } from "@/actions/result";

/** Role picker plus invite / removal actions for one company member row. */
export function MemberActions({
  companyId,
  userId,
  email,
  role,
  pendingInvite,
}: {
  companyId: string;
  userId: string;
  email: string;
  role: string;
  pendingInvite: boolean;
}) {
  const router = useRouter();
  const { confirm, alert } = useAlert();
  const [pending, start] = useTransition();
  const [roleValue, setRoleValue] = useState(role);

  function run(action: () => Promise<ActionResult>, success: string, onFail?: () => void) {
    start(async () => {
      const result = await action();
      if (result.ok) {
        toast(success);
        router.refresh();
      } else {
        onFail?.();
        void alert({ title: "Something went wrong", message: result.error });
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <label className="sr-only" htmlFor={`role-${userId}`}>
        Role for {email}
      </label>
      <select
        id={`role-${userId}`}
        value={roleValue}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          const previous = roleValue;
          setRoleValue(next);
          run(
            () => platformChangeMemberRole(companyId, userId, next),
            "Role updated.",
            () => setRoleValue(previous),
          );
        }}
        className="rounded-lg border border-border bg-white px-2 py-1 text-xs"
      >
        {TENANT_ROLES.map((r) => (
          <option key={r} value={r}>
            {roleLabel(r)}
          </option>
        ))}
      </select>
      {pendingInvite ? (
        <>
          <Button
            type="button"
            variant="secondary"
            className="!px-3 !py-1 text-xs"
            disabled={pending}
            onClick={() =>
              run(() => platformResendCompanyInvite(companyId, userId), `Invite re-sent to ${email}.`)
            }
          >
            Resend invite
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="!px-3 !py-1 text-xs"
            disabled={pending}
            onClick={async () => {
              const ok = await confirm({
                title: "Revoke invite?",
                message: `${email} will no longer be able to accept their invitation.`,
                confirmLabel: "Revoke invite",
                variant: "destructive",
              });
              if (ok) run(() => platformRevokeCompanyInvite(companyId, userId), "Invite revoked.");
            }}
          >
            Revoke
          </Button>
        </>
      ) : (
        <Button
          type="button"
          variant="ghost"
          className="!px-3 !py-1 text-xs text-red-700"
          disabled={pending}
          onClick={async () => {
            const ok = await confirm({
              title: "Remove member?",
              message: `${email} will lose access to this company. If it is their only company, their account is deleted.`,
              confirmLabel: "Remove member",
              variant: "destructive",
            });
            if (ok) run(() => platformRemoveCompanyMember(companyId, userId), "Member removed.");
          }}
        >
          Remove
        </Button>
      )}
    </div>
  );
}
