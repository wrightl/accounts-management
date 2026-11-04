"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setAssistantConnected, setAssistantDrafts } from "@/actions/assistant";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/form";

export type ConnectionRow = {
  id: string;
  name: string;
  /** The assistant gave `name` itself, which any app can do. */
  named: boolean;
  /** The OAuth client it signed in as. */
  clientId: string;
  /** "Used 5 minutes ago", worked out on the server. */
  used: string;
  disconnected: boolean;
  allowDrafts: boolean;
};

/** Assistants this person has connected, with a way to cut each one off. */
export function AssistantConnections({
  connections,
  canDraft,
}: {
  connections: ConnectionRow[];
  /** The person's role lets them create records, so drafts can be offered. */
  canDraft: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (connections.length === 0) {
    return (
      <p className="text-sm text-muted">
        None yet. Once you&apos;ve connected one and asked it something, it shows here.
      </p>
    );
  }

  function run(id: string, action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const result = await action();
      setBusyId(null);
      if (result.ok) router.refresh();
      else setError(result.error ?? "Something went wrong. Try again.");
    });
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {connections.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-foreground">{c.name}</span>
              <span className="block break-all text-xs text-muted">
                {c.named ? "The name it gave itself." : "It didn't give a name."} OAuth client{" "}
                {c.clientId}
              </span>
              <span className="block text-sm text-muted">
                {c.disconnected ? "Disconnected. It can't read anything in Alfa." : c.used}
              </span>
              {canDraft && !c.disconnected ? (
                <label className="mt-2 flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={c.allowDrafts}
                    disabled={pending}
                    onChange={(e) => {
                      const allowed = e.target.checked;
                      run(c.id, () => setAssistantDrafts(c.id, allowed));
                    }}
                    className="mt-1"
                  />
                  <span>
                    Let it make drafts
                    <span className="block text-xs text-muted">
                      Draft invoices and quotes, and expenses waiting for review. You check and
                      send them in Alfa.
                    </span>
                  </span>
                </label>
              ) : null}
            </span>
            <Button
              type="button"
              variant={c.disconnected ? "secondary" : "destructive"}
              disabled={pending}
              onClick={() => run(c.id, () => setAssistantConnected(c.id, c.disconnected))}
            >
              {busyId === c.id ? "Saving…" : c.disconnected ? "Allow again" : "Disconnect"}
            </Button>
          </li>
        ))}
      </ul>
      <FieldError>{error}</FieldError>
    </div>
  );
}
