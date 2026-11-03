"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setAssistantConnected } from "@/actions/assistant";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/form";

export type ConnectionRow = {
  id: string;
  name: string;
  /** "Used 5 minutes ago", worked out on the server. */
  used: string;
  disconnected: boolean;
};

/** Assistants this person has connected, with a way to cut each one off. */
export function AssistantConnections({ connections }: { connections: ConnectionRow[] }) {
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

  function change(id: string, connected: boolean) {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const result = await setAssistantConnected(id, connected);
      setBusyId(null);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {connections.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-foreground">{c.name}</span>
              <span className="block text-sm text-muted">
                {c.disconnected ? "Disconnected. It can't read anything in Alfa." : c.used}
              </span>
            </span>
            <Button
              type="button"
              variant={c.disconnected ? "secondary" : "destructive"}
              disabled={pending}
              onClick={() => change(c.id, c.disconnected)}
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
