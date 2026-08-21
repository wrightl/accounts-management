"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/form";
import {
  confirmBankMatch,
  dismissBankMatch,
  importStarlingCsv,
  runSuggestMatches,
} from "@/actions/bank";

export function BankImportForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-3 rounded-xl border border-border p-4"
      action={(formData) => {
        setError(null);
        setMessage(null);
        startTransition(async () => {
          const result = await importStarlingCsv(formData);
          if (!result.ok) setError(result.error);
          else {
            setMessage(
              `Imported ${result.inserted ?? 0} new rows (${result.skipped ?? 0} duplicates skipped).`,
            );
            router.refresh();
          }
        });
      }}
    >
      <h2 className="font-display text-lg font-semibold">Import Starling CSV</h2>
      <div>
        <Label htmlFor="csv">Statement file</Label>
        <Input id="csv" name="csv" type="file" accept=".csv,text/csv" required disabled={pending} />
      </div>
      <FieldError>{error}</FieldError>
      {message && <p className="text-sm text-success">{message}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Importing…" : "Import"}
      </Button>
    </form>
  );
}

export function BankToolbar({ canWrite }: { canWrite: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (!canWrite) return null;
  return (
    <Button
      type="button"
      variant="secondary"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await runSuggestMatches();
          router.refresh();
        });
      }}
    >
      {pending ? "Matching…" : "Re-run suggestions"}
    </Button>
  );
}

export function MatchActions({
  matchId,
  confirmed,
  canWrite,
}: {
  matchId: string | null;
  confirmed: boolean;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (!canWrite || !matchId) return null;
  if (confirmed) {
    return <span className="text-xs text-success">Confirmed</span>;
  }
  return (
    <div className="flex gap-1">
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            await confirmBankMatch(matchId);
            router.refresh();
          });
        }}
      >
        Confirm
      </Button>
      <Button
        type="button"
        variant="ghost"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            await dismissBankMatch(matchId);
            router.refresh();
          });
        }}
      >
        Dismiss
      </Button>
    </div>
  );
}
