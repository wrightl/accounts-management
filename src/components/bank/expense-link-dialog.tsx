"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useState, useTransition, type ReactNode } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { useAlert } from "@/components/ui/alert-dialog";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { FieldError, Input, Label } from "@/components/ui/form";
import {
  findBankTransactionsForExpenseAction,
  findExpensesForBankTransactionAction,
  linkExpenseToBankTransactionAction,
  unlinkExpenseAction,
  type BankDebitLinkCandidate,
  type ExpenseLinkCandidate,
} from "@/actions/bank";
import { formatGBP } from "@/lib/money";
import { cn } from "@/lib/utils";

const SEARCH_DEBOUNCE_MS = 250;

/** "Exact amount" or how far the expense is from the bank payment. */
function amountDeltaLabel(deltaPence: number | null, foreignCurrency?: string | null): string {
  if (foreignCurrency) return `Receipt in ${foreignCurrency}`;
  if (deltaPence == null) return "";
  if (deltaPence === 0) return "Exact amount";
  const diff = formatGBP(Math.abs(deltaPence));
  return deltaPence > 0 ? `Expense ${diff} more` : `Expense ${diff} less`;
}

/** How far a foreign receipt, converted to sterling, is from the bank payment. */
function fxDeltaLabel(deltaPence: number | null, currency: string): string {
  if (deltaPence == null) return `Receipt in ${currency}`;
  if (deltaPence === 0) return `Matches ${currency} at BoE rate`;
  const diff = formatGBP(Math.abs(deltaPence));
  return `Payment ${diff} ${deltaPence > 0 ? "less" : "more"} than ${currency} at BoE rate`;
}

function dateGapLabel(days: number | null): string {
  if (days == null) return "";
  if (days === 0) return "same day";
  return `${days} day${days === 1 ? "" : "s"} apart`;
}

type Loaded<T> = { ok: true; candidates: T[] } | { ok: false; error: string };

function useCandidates<T>(open: boolean, load: (query: string) => Promise<Loaded<T>>) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ query: string; data: Loaded<T> } | null>(null);
  const runLoad = useEffectEvent((q: string) => load(q));

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(
      () => {
        void runLoad(query).then((data) => {
          if (!cancelled) setResult({ query, data });
        });
      },
      query ? SEARCH_DEBOUNCE_MS : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query]);

  const loading = result === null || result.query !== query;
  return { query, setQuery, result: result?.data ?? null, loading };
}

function LinkPickerDialog<T>({
  open,
  onClose,
  title,
  intro,
  searchLabel,
  searchPlaceholder,
  emptyMessage,
  load,
  keyOf,
  renderCandidate,
  onLink,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  intro: ReactNode;
  searchLabel: string;
  searchPlaceholder: string;
  emptyMessage: string;
  load: (query: string) => Promise<Loaded<T>>;
  keyOf: (candidate: T) => string;
  renderCandidate: (candidate: T) => ReactNode;
  onLink: (key: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  footer?: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const { query, setQuery, result, loading } = useCandidates(open, load);
  const candidates = result?.ok ? result.candidates : [];
  const selectedKey =
    selected && candidates.some((c) => keyOf(c) === selected) ? selected : null;

  const handleClose = () => {
    if (!pending) onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} title={title} className="max-w-2xl">
      <div className="text-sm text-muted">{intro}</div>
      <div className="mt-4">
        <Label htmlFor="link-search">{searchLabel}</Label>
        <Input
          id="link-search"
          type="search"
          value={query}
          placeholder={searchPlaceholder}
          onChange={(e) => setQuery(e.target.value)}
          disabled={pending}
          autoComplete="off"
        />
      </div>
      <div className="mt-4 min-h-[6rem]" aria-live="polite" aria-busy={loading}>
        {result && !result.ok ? (
          <FieldError>{result.error}</FieldError>
        ) : loading && candidates.length === 0 ? (
          <p className="text-sm text-muted">Searching…</p>
        ) : candidates.length === 0 ? (
          <p className="text-sm text-muted">{emptyMessage}</p>
        ) : (
          <ul
            role="radiogroup"
            aria-label={title}
            className={cn("max-h-[22rem] space-y-2 overflow-y-auto", loading && "opacity-60")}
          >
            {candidates.map((candidate) => {
              const key = keyOf(candidate);
              const checked = key === selectedKey;
              return (
                <li key={key}>
                  <label
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm",
                      checked ? "border-navy bg-wash" : "border-border hover:bg-wash/60",
                    )}
                  >
                    <input
                      type="radio"
                      name="link-candidate"
                      className="mt-1 h-4 w-4"
                      checked={checked}
                      onChange={() => setSelected(key)}
                      disabled={pending}
                    />
                    <div className="min-w-0 flex-1">{renderCandidate(candidate)}</div>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <FieldError>{error}</FieldError>
      <DialogActions className="flex-wrap">
        {footer ? <div className="mr-auto">{footer}</div> : null}
        <Button type="button" variant="ghost" disabled={pending} onClick={handleClose}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={pending || !selectedKey}
          onClick={() => {
            if (!selectedKey) return;
            setError(null);
            startTransition(async () => {
              const linked = await onLink(selectedKey);
              if (!linked.ok) {
                setError(linked.error);
                return;
              }
              router.refresh();
              onClose();
            });
          }}
        >
          {pending ? "Linking…" : "Link"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function CandidateMeta({ parts }: { parts: string[] }) {
  const shown = parts.filter(Boolean);
  if (shown.length === 0) return null;
  return <p className="mt-0.5 text-xs text-muted">{shown.join(" · ")}</p>;
}

/** Transactions page: pick an existing expense for an outgoing payment. */
export function AttachExpenseDialog({
  open,
  onClose,
  transactionId,
}: {
  open: boolean;
  onClose: () => void;
  transactionId: string;
}) {
  return (
    <LinkPickerDialog<ExpenseLinkCandidate>
      open={open}
      onClose={onClose}
      title="Attach expense"
      intro="Link a recorded expense to this payment. Closest amounts and dates are listed first; search to look further back."
      searchLabel="Search expenses"
      searchPlaceholder="e.g. Adobe, train to Leeds"
      emptyMessage="No unlinked expenses found. Try a different search, or create a new expense from this payment."
      load={(query) => findExpensesForBankTransactionAction(transactionId, query)}
      keyOf={(c) => c.expenseId}
      renderCandidate={(c) => (
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium">{c.description}</p>
            <CandidateMeta
              parts={[c.spentAt ?? "No date", dateGapLabel(c.dateGapDays)]}
            />
          </div>
          <div className="text-right">
            <p className="font-medium tabular-nums">{c.amountFormatted}</p>
            <CandidateMeta parts={[amountDeltaLabel(c.amountDeltaPence, c.foreignCurrency)]} />
          </div>
        </div>
      )}
      onLink={(expenseId) =>
        linkExpenseToBankTransactionAction({ expenseId, bankTransactionId: transactionId })
      }
      footer={
        <Link
          href={`/expenses/new?bankTransactionId=${encodeURIComponent(transactionId)}`}
          className="text-sm font-medium underline-offset-2 hover:underline"
        >
          Create a new expense instead →
        </Link>
      }
    />
  );
}

/** Expense page: pick the outgoing bank payment that settled this expense. */
export function LinkBankTransactionDialog({
  open,
  onClose,
  expenseId,
}: {
  open: boolean;
  onClose: () => void;
  expenseId: string;
}) {
  return (
    <LinkPickerDialog<BankDebitLinkCandidate>
      open={open}
      onClose={onClose}
      title="Link bank transaction"
      intro="Choose the payment that settled this expense. Closest amounts and dates are listed first; search to look further back."
      searchLabel="Search transactions"
      searchPlaceholder="Counterparty or reference"
      emptyMessage="No unreconciled outgoing payments found. Try a different search, or import a newer bank statement."
      load={(query) => findBankTransactionsForExpenseAction(expenseId, query)}
      keyOf={(c) => c.bankTransactionId}
      renderCandidate={(c) => (
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium">{c.counterparty ?? c.reference ?? "Unknown"}</p>
            <CandidateMeta
              parts={[
                c.bookedAt,
                dateGapLabel(c.dateGapDays),
                c.reference && c.reference !== c.counterparty ? c.reference : "",
                c.bankAccountName,
              ]}
            />
          </div>
          <div className="text-right">
            <p className="font-medium tabular-nums">{c.amountFormatted}</p>
            <CandidateMeta
              parts={[
                c.fxCurrency
                  ? fxDeltaLabel(c.amountDeltaPence, c.fxCurrency)
                  : amountDeltaLabel(c.amountDeltaPence),
              ]}
            />
          </div>
        </div>
      )}
      onLink={(bankTransactionId) =>
        linkExpenseToBankTransactionAction({ expenseId, bankTransactionId })
      }
    />
  );
}

/** Button + dialog for the expense detail page. */
export function LinkBankTransactionButton({ expenseId }: { expenseId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={buttonClasses("secondary")} onClick={() => setOpen(true)}>
        Link bank transaction
      </button>
      {open ? (
        <LinkBankTransactionDialog
          open={open}
          onClose={() => setOpen(false)}
          expenseId={expenseId}
        />
      ) : null}
    </>
  );
}

/** Undo the expense's bank link from the expense detail page. */
export function UnlinkExpenseButton({ expenseId }: { expenseId: string }) {
  const router = useRouter();
  const { confirm } = useAlert();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        className="font-medium text-foreground underline-offset-2 hover:underline disabled:opacity-50"
        disabled={pending}
        onClick={async () => {
          const ok = await confirm({
            title: "Unlink bank transaction",
            message:
              "Remove the link between this expense and the payment? Both stay in your books; the payment goes back to unreconciled.",
            confirmLabel: "Unlink",
          });
          if (!ok) return;
          setError(null);
          startTransition(async () => {
            const result = await unlinkExpenseAction({ expenseId });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        {pending ? "Unlinking…" : "Unlink"}
      </button>
      {error ? <FieldError>{error}</FieldError> : null}
    </>
  );
}
