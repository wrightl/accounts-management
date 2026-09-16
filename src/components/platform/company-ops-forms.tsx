"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  addCompanySupportNote,
  platformInviteCompanyAdmin,
  suspendCompany,
  unsuspendCompany,
} from "@/actions/platform";

export function CompanySuspendForm({
  companyId,
  suspended,
}: {
  companyId: string;
  suspended: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  return (
    <div className="rounded-2xl border border-border bg-white p-5">
      <h2 className="font-display text-lg font-semibold">
        {suspended ? "Unsuspend company" : "Suspend company"}
      </h2>
      <p className="mt-1 text-sm text-muted">
        Suspended companies cannot write data or send outbound email via cron.
      </p>
      {!suspended ? (
        <label className="mt-3 block text-sm">
          Reason (optional)
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2"
          />
        </label>
      ) : null}
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      <Button
        type="button"
        variant={suspended ? "primary" : "destructive"}
        className="mt-4"
        disabled={pending}
        onClick={() => {
          setError(null);
          start(async () => {
            const result = suspended
              ? await unsuspendCompany(companyId)
              : await suspendCompany(companyId, reason);
            if (!result.ok) setError(result.error);
            else router.refresh();
          });
        }}
      >
        {suspended ? "Unsuspend" : "Suspend"}
      </Button>
    </div>
  );
}

export function CompanySupportNoteForm({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");

  return (
    <form
      className="mt-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const result = await addCompanySupportNote(companyId, body);
          if (!result.ok) setError(result.error);
          else {
            setBody("");
            router.refresh();
          }
        });
      }}
    >
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="Add a support note…"
        className="w-full rounded-lg border border-border px-3 py-2 text-sm"
      />
      {error ? <p className="mt-1 text-sm text-red-700">{error}</p> : null}
      <Button type="submit" className="mt-2" disabled={pending || !body.trim()}>
        Add note
      </Button>
    </form>
  );
}

export function CompanyInviteAdminForm({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  return (
    <form
      className="mt-3 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setOk(false);
        const formData = new FormData(e.currentTarget);
        formData.set("companyId", companyId);
        start(async () => {
          const result = await platformInviteCompanyAdmin(formData);
          if (!result.ok) setError(result.error);
          else {
            setOk(true);
            e.currentTarget.reset();
            router.refresh();
          }
        });
      }}
    >
      <input type="hidden" name="companyId" value={companyId} />
      <label className="block text-sm">
        Email
        <input
          name="email"
          type="email"
          required
          className="mt-1 w-full rounded-lg border border-border px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        Name (optional)
        <input
          name="name"
          type="text"
          className="mt-1 w-full rounded-lg border border-border px-3 py-2"
        />
      </label>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {ok ? <p className="text-sm text-green-700">Invitation sent.</p> : null}
      <Button type="submit" disabled={pending}>
        Invite admin
      </Button>
    </form>
  );
}
