"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { FieldError, Input, Label, Select } from "@/components/ui/form";
import {
  confirmBankMatch,
  confirmBankMatchesBatch,
  deleteBankSpendingCategory,
  dismissBankMatch,
  dismissBankMatchesBatch,
  runSuggestMatches,
  updateBankCategory,
  type SuggestedMatch,
} from "@/actions/bank";
import { BankImportForm } from "@/components/bank/bank-import-form";
import {
  bankCategorySelectOptions,
  formatBankCategory,
  isSelectableBankCategory,
} from "@/lib/bank/categories";
import type { MatchScoreBreakdown } from "@/lib/bank/match";
import type { BankSpendingCategoryRow } from "@/lib/bank/spending-categories";

function ScoreBreakdown({ breakdown }: { breakdown: MatchScoreBreakdown }) {
  const chips: string[] = [];
  if (breakdown.invoiceRefScore > 0) {
    chips.push(`Invoice ref ${breakdown.invoiceRefScore}%`);
  }
  if (breakdown.counterpartyScore > 0) {
    chips.push(`Client ${breakdown.counterpartyScore}%`);
  }
  if (breakdown.paymentRefScore > 0) {
    chips.push(`Payment ref ${breakdown.paymentRefScore}%`);
  }
  if (chips.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {chips.map((chip) => (
        <span
          key={chip}
          className="rounded-full bg-wash px-2 py-0.5 text-xs text-muted"
        >
          {chip}
        </span>
      ))}
    </div>
  );
}

function targetLabel(target: SuggestedMatch["target"]): string {
  if (target.kind === "invoice_payment") {
    return `${target.invoiceNumber} · ${target.clientName}`;
  }
  if (target.kind === "reimbursement") {
    return `Reimbursement · ${target.payeeName} · ${target.totalFormatted}`;
  }
  return target.description;
}

export function SuggestMatchesDialog({
  open,
  suggestions,
  onClose,
}: {
  open: boolean;
  suggestions: SuggestedMatch[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [items, setItems] = useState(suggestions);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [prevOpen, setPrevOpen] = useState(open);
  const [prevSuggestions, setPrevSuggestions] = useState(suggestions);

  if (open !== prevOpen || (open && suggestions !== prevSuggestions)) {
    setPrevOpen(open);
    setPrevSuggestions(suggestions);
    if (open) setItems(suggestions);
  }

  const invoiceCount = items.filter((s) => s.matchType === "invoice_payment").length;
  const expenseCount = items.filter((s) => s.matchType === "expense").length;
  const reimbursementCount = items.filter((s) => s.matchType === "reimbursement").length;

  const handleClose = () => {
    if (!pending) onClose();
  };

  const removeItems = (ids: string[]) => {
    setItems((current) => current.filter((item) => !ids.includes(item.matchId)));
  };

  const runAction = (action: () => Promise<{ ok: boolean; error?: string }>, ids: string[]) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Action failed");
        return;
      }
      removeItems(ids);
      router.refresh();
      if (items.length === ids.length) onClose();
    });
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Match suggestions"
      className="max-w-2xl"
    >
      {items.length === 0 ? (
        <p className="text-sm text-muted">No new suggestions were found.</p>
      ) : (
        <>
          <p className="text-sm text-muted">
            Found {items.length} suggestion{items.length === 1 ? "" : "s"}
            {invoiceCount > 0 || expenseCount > 0 || reimbursementCount > 0 ? (
              <>
                {" "}
                ({invoiceCount} invoice payment{invoiceCount === 1 ? "" : "s"}
                {expenseCount > 0 ? `, ${expenseCount} expense${expenseCount === 1 ? "" : "s"}` : ""}
                {reimbursementCount > 0
                  ? `, ${reimbursementCount} reimbursement${reimbursementCount === 1 ? "" : "s"}`
                  : ""}
                )
              </>
            ) : null}
            . Review and accept or decline each match.
          </p>
          <ul className="mt-4 max-h-[24rem] space-y-3 overflow-y-auto">
            {items.map((item) => (
              <li
                key={item.matchId}
                className="rounded-xl border border-border bg-wash/40 p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {item.tx.counterparty ?? "Unknown"} · {item.tx.amountFormatted}
                    </p>
                    <p className="text-sm text-muted">
                      {item.tx.bookedAt}
                      {item.tx.reference ? ` · ${item.tx.reference}` : ""}
                    </p>
                    <p className="mt-2 text-sm">
                      → {targetLabel(item.target)}
                      <span className="ml-2 text-xs text-muted">Score {item.score}</span>
                    </p>
                    <ScoreBreakdown breakdown={item.breakdown} />
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={pending}
                      onClick={() =>
                        runAction(() => confirmBankMatch(item.matchId), [item.matchId])
                      }
                    >
                      Accept
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        runAction(() => dismissBankMatch(item.matchId), [item.matchId])
                      }
                    >
                      Decline
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      <FieldError>{error}</FieldError>
      <DialogActions>
        {items.length > 0 ? (
          <>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                runAction(
                  () => dismissBankMatchesBatch(items.map((i) => i.matchId)),
                  items.map((i) => i.matchId),
                )
              }
            >
              Decline all
            </Button>
            <Button
              type="button"
              disabled={pending}
              onClick={() =>
                runAction(
                  () => confirmBankMatchesBatch(items.map((i) => i.matchId)),
                  items.map((i) => i.matchId),
                )
              }
            >
              Accept all
            </Button>
          </>
        ) : null}
        <Button type="button" variant="secondary" disabled={pending} onClick={handleClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function BankToolbar({ canWrite }: { canWrite: boolean }) {
  const router = useRouter();
  const [importOpen, setImportOpen] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedMatch[]>([]);
  const [pending, startTransition] = useTransition();
  if (!canWrite) return null;

  const openSuggestions = (items: SuggestedMatch[]) => {
    setSuggestions(items);
    setSuggestionsOpen(true);
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => setImportOpen(true)}>
          Import
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              const result = await runSuggestMatches();
              if (result.ok && result.suggestions?.length) {
                openSuggestions(result.suggestions);
              }
              router.refresh();
            });
          }}
        >
          {pending ? "Matching…" : "Re-run suggestions"}
        </Button>
      </div>
      <Dialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import bank CSV"
        className="max-w-2xl"
      >
        <BankImportForm
          onSuccess={() => setImportOpen(false)}
          onSuggestions={(items) => {
            setImportOpen(false);
            openSuggestions(items);
          }}
        />
      </Dialog>
      <SuggestMatchesDialog
        open={suggestionsOpen}
        suggestions={suggestions}
        onClose={() => setSuggestionsOpen(false)}
      />
    </>
  );
}

export function CategoryCell({
  transactionId,
  spendingCategory,
  customCategories,
  canWrite,
}: {
  transactionId: string;
  spendingCategory: string | null;
  customCategories: readonly string[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const selectable =
    spendingCategory !== null &&
    spendingCategory !== "" &&
    isSelectableBankCategory(spendingCategory, customCategories);
  const [mode, setMode] = useState<"select" | "custom">(
    spendingCategory && !selectable ? "custom" : "select",
  );
  const [customValue, setCustomValue] = useState(
    spendingCategory && !selectable ? spendingCategory : "",
  );

  if (!canWrite) {
    return (
      <span className="text-sm">{formatBankCategory(spendingCategory)}</span>
    );
  }

  const save = (value: string | null) => {
    startTransition(async () => {
      await updateBankCategory(transactionId, value);
      router.refresh();
    });
  };

  const categoryOptions = bankCategorySelectOptions(customCategories);

  if (mode === "custom") {
    return (
      <Input
        className="min-w-[10rem] py-1 text-sm"
        value={customValue}
        disabled={pending}
        placeholder="Custom category"
        onChange={(e) => setCustomValue(e.target.value)}
        onBlur={() => {
          const trimmed = customValue.trim();
          if (trimmed) save(trimmed);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const trimmed = customValue.trim();
            if (trimmed) save(trimmed);
          }
          if (e.key === "Escape") {
            setMode("select");
            setCustomValue("");
          }
        }}
      />
    );
  }

  const selectValue =
    spendingCategory && selectable
      ? spendingCategory
      : spendingCategory
        ? "__custom__"
        : "";

  return (
    <Select
      className="min-w-[10rem] py-1 text-sm"
      disabled={pending}
      value={selectValue}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "__custom__") {
          setMode("custom");
          setCustomValue(spendingCategory && !selectable ? spendingCategory : "");
          return;
        }
        save(v === "" ? null : v);
      }}
    >
      <option value="">—</option>
      {categoryOptions.map((c) => (
        <option key={c.value} value={c.value}>
          {c.label}
        </option>
      ))}
      <option value="__custom__">Custom…</option>
    </Select>
  );
}

export function CustomCategoriesPanel({
  categories,
  canWrite,
}: {
  categories: BankSpendingCategoryRow[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canWrite || categories.length === 0) return null;

  return (
    <section className="mt-6 rounded-xl border border-border bg-surface p-4">
      <h2 className="font-display text-lg font-semibold">Custom categories</h2>
      <p className="mt-1 text-sm text-muted">
        Saved labels appear in category dropdowns. Remove unused ones here.
      </p>
      <FieldError>{error}</FieldError>
      <ul className="mt-4 divide-y divide-border">
        {categories.map((category) => {
          const inUse = category.usageCount > 0;
          const removing = pending && pendingId === category.id;
          return (
            <li
              key={category.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div>
                <p className="font-medium">{category.name}</p>
                <p className="text-sm text-muted">
                  {inUse
                    ? `${category.usageCount} transaction${category.usageCount === 1 ? "" : "s"}`
                    : "Not used on any transaction"}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                disabled={inUse || removing}
                onClick={() => {
                  setError(null);
                  setPendingId(category.id);
                  startTransition(async () => {
                    const result = await deleteBankSpendingCategory(category.id);
                    setPendingId(null);
                    if (!result.ok) setError(result.error);
                    else router.refresh();
                  });
                }}
              >
                {removing ? "Removing…" : "Remove"}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
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

export function MatchStatusLabel({
  row,
}: {
  row: {
    reconciled: boolean;
    suggested: boolean;
    matchType: string | null;
    matchLabel: string | null;
  };
}) {
  let label: ReactNode;
  if (row.reconciled) {
    label = row.matchLabel ? `Matched · ${row.matchLabel}` : `Matched (${row.matchType})`;
  } else if (row.suggested) {
    label = row.matchLabel ? `Suggested · ${row.matchLabel}` : `Suggested (${row.matchType})`;
  } else {
    label = "Unreconciled";
  }
  return <span className="text-sm">{label}</span>;
}
