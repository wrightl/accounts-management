"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import {
  acceptCategorySuggestions,
  acceptReceiptMatch,
  dismissCategorySuggestions,
  runBookkeeperSuggestions,
} from "@/actions/bookkeeper";
import { dismissBankMatch } from "@/actions/bank";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/form";
import { formatIsoDateUk } from "@/lib/dates";
import { formatGBP } from "@/lib/money";

export type CategorySuggestionRow = {
  id: string;
  bookedAt: string;
  counterparty: string | null;
  amountPence: number;
  categoryLabel: string;
  reason: string | null;
  source: string | null;
};

export type ReceiptMatchRow = {
  matchId: string;
  expenseDescription: string;
  expenseAmountPence: number;
  spentAt: string | null;
  bankAmountPence: number;
  bookedAt: string;
  counterparty: string | null;
  explanation: string;
};

export function FindSuggestionsButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await runBookkeeperSuggestions();
            if (!result.ok) {
              setMessage(result.error ?? "Couldn't look for suggestions.");
              return;
            }
            const c = result.categories!;
            const found = c.fromHistory + c.fromAi + (result.receipts ?? 0);
            setMessage(
              found === 0
                ? "Nothing new to suggest."
                : `Found ${c.fromHistory + c.fromAi} categor${c.fromHistory + c.fromAi === 1 ? "y" : "ies"} and ${result.receipts} receipt match${result.receipts === 1 ? "" : "es"}.` +
                    (result.aiUnavailable ? " AI isn't set up, so only categories learned from your history." : ""),
            );
            router.refresh();
          })
        }
      >
        <Sparkles className="h-4 w-4" aria-hidden />
        {pending ? "Looking…" : "Find suggestions"}
      </Button>
      {message ? (
        <span role="status" className="text-sm text-muted">
          {message}
        </span>
      ) : null}
    </div>
  );
}

export function CategorySuggestionList({
  rows,
  canWrite,
}: {
  rows: CategorySuggestionRow[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error ?? "Something went wrong.");
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted">No category suggestions waiting.</p>;
  }
  return (
    <div className="space-y-3">
      {canWrite ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => run(() => acceptCategorySuggestions(rows.map((r) => r.id)))}
          >
            Accept all {rows.length}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => run(() => dismissCategorySuggestions(rows.map((r) => r.id)))}
          >
            Dismiss all
          </Button>
        </div>
      ) : null}
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {r.counterparty ?? "Unknown payee"} · {formatGBP(-r.amountPence)}
                <span className="font-normal text-muted"> · {formatIsoDateUk(r.bookedAt)}</span>
              </p>
              <p className="mt-0.5 text-sm">
                → {r.categoryLabel}
                <span className="ml-2 rounded-full bg-wash px-2 py-0.5 text-xs text-muted">
                  {r.source === "history" ? "Learned" : "AI"}
                </span>
              </p>
              {r.reason ? <p className="mt-0.5 text-xs text-muted">{r.reason}</p> : null}
            </div>
            {canWrite ? (
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => run(() => acceptCategorySuggestions([r.id]))}
                >
                  Accept
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => run(() => dismissCategorySuggestions([r.id]))}
                >
                  Dismiss
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <FieldError>{error}</FieldError>
    </div>
  );
}

export function ReceiptMatchList({ rows, canWrite }: { rows: ReceiptMatchRow[]; canWrite: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [useBank, setUseBank] = useState<Record<string, boolean>>({});

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error ?? "Something went wrong.");
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted">No receipt matches waiting.</p>;
  }
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {rows.map((r) => {
          const bank = -r.bankAmountPence;
          const differs = bank !== r.expenseAmountPence;
          return (
            <li key={r.matchId} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">
                  {r.expenseDescription} · {formatGBP(r.expenseAmountPence)}
                  {r.spentAt ? <span className="font-normal text-muted"> · {formatIsoDateUk(r.spentAt)}</span> : null}
                </p>
                <p className="mt-0.5">
                  → {r.counterparty ?? "Card payment"} · {formatGBP(bank)}
                  <span className="text-muted"> · {formatIsoDateUk(r.bookedAt)}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted">{r.explanation}</p>
                {canWrite && differs ? (
                  <label className="mt-2 flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={useBank[r.matchId] ?? false}
                      onChange={(e) => setUseBank((prev) => ({ ...prev, [r.matchId]: e.target.checked }))}
                    />
                    Change the expense to the bank amount ({formatGBP(bank)})
                  </label>
                ) : null}
              </div>
              {canWrite ? (
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => run(() => acceptReceiptMatch(r.matchId, useBank[r.matchId] ?? false))}
                  >
                    Accept
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => run(() => dismissBankMatch(r.matchId))}
                  >
                    Decline
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <FieldError>{error}</FieldError>
    </div>
  );
}
