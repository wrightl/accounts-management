"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, MoreHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { overlayPortalTarget } from "@/components/ui/portal-target";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/form";
import {
  clearBankCreditExplanationAction,
  confirmBankMatch,
  confirmBankMatchesBatch,
  createBankSpendingCategoryAction,
  deleteBankSpendingCategory,
  dismissBankMatch,
  dismissBankMatchesBatch,
  explainBankCreditAction,
  renameBankSpendingCategoryAction,
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
import { incomeCategorySelectOptions } from "@/lib/bank/income-categories";
import type { MatchScoreBreakdown } from "@/lib/bank/match";
import { explainMatch } from "@/lib/bookkeeper/explain";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/actions/result";
import type { BankSpendingCategoryRow } from "@/lib/bank/spending-categories";

function isCreditExplainMatchType(value: string | null): boolean {
  return (
    value === "other_income" ||
    value === "transfer" ||
    value === "tax_or_loan"
  );
}

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
                    <p className="mt-1 text-xs text-muted">
                      {explainMatch({
                        matchType: item.matchType,
                        breakdown: item.breakdown,
                        note: item.note,
                      })}
                    </p>
                    {item.note && !item.note.startsWith("AI:") ? (
                      <p className="mt-1 text-xs text-muted">{item.note}</p>
                    ) : null}
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

export function BankToolbar({
  canWrite,
  customCategories,
}: {
  canWrite: boolean;
  customCategories: BankSpendingCategoryRow[];
}) {
  const router = useRouter();
  const [importOpen, setImportOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
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
        <Button type="button" variant="secondary" onClick={() => setCategoriesOpen(true)}>
          Categories
        </Button>
      </div>
      <CustomCategoriesDialog
        open={categoriesOpen}
        categories={customCategories}
        onClose={() => setCategoriesOpen(false)}
      />
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
  const [mode, setMode] = useState<"select" | "custom">("select");
  const [customValue, setCustomValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!canWrite) {
    return (
      <span className="text-sm">{formatBankCategory(spendingCategory)}</span>
    );
  }

  const save = (value: string | null) => {
    setError(null);
    startTransition(async () => {
      const result = await updateBankCategory(transactionId, value);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMode("select");
      setCustomValue("");
      router.refresh();
    });
  };

  const commitCustom = () => {
    const trimmed = customValue.trim();
    if (!trimmed || trimmed === spendingCategory) {
      setMode("select");
      setCustomValue("");
      return;
    }
    save(trimmed);
  };

  const categoryOptions = bankCategorySelectOptions(customCategories);
  const errorText = error ? <FieldError>{error}</FieldError> : null;

  if (mode === "custom") {
    return (
      <div>
        <Input
          className="min-w-[10rem] py-1 text-sm"
          value={customValue}
          disabled={pending}
          maxLength={120}
          autoFocus
          placeholder="Custom category"
          aria-label="Custom category"
          onChange={(e) => setCustomValue(e.target.value)}
          onBlur={() => {
            if (!pending) commitCustom();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              // Blur commits, so Enter and blur never both save.
              e.currentTarget.blur();
            }
            if (e.key === "Escape") {
              setMode("select");
              setCustomValue("");
            }
          }}
        />
        {errorText}
      </div>
    );
  }

  const selectValue =
    spendingCategory && selectable
      ? spendingCategory
      : spendingCategory
        ? "__custom__"
        : "";

  return (
    <div>
      <Select
        className="min-w-[10rem] py-1 text-sm"
        disabled={pending}
        aria-label="Category"
        value={selectValue}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__custom__") return;
          if (v === "__new__") {
            setMode("custom");
            setCustomValue("");
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
        {spendingCategory && !selectable ? (
          <option value="__custom__">{spendingCategory}</option>
        ) : null}
        <option value="__new__">Custom…</option>
      </Select>
      {errorText}
    </div>
  );
}

function CustomCategoryRow({
  category,
  disabled,
  onError,
}: {
  category: BankSpendingCategoryRow;
  disabled: boolean;
  onError: (error: string | null) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [pending, startTransition] = useTransition();
  const inUse = category.usageCount > 0;

  const run = (action: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => {
    onError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        onError(result.error ?? "Could not update category");
        return;
      }
      onOk?.();
      router.refresh();
    });
  };

  if (editing) {
    return (
      <li className="py-3 first:pt-0 last:pb-0">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => renameBankSpendingCategoryAction(category.id, name),
              () => setEditing(false),
            );
          }}
        >
          <Input
            aria-label={`Rename ${category.name}`}
            className="min-w-[10rem] flex-1 py-1 text-sm"
            value={name}
            maxLength={120}
            autoFocus
            disabled={pending}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                // Keep the dialog open; just leave edit mode.
                e.preventDefault();
                e.stopPropagation();
                setName(category.name);
                setEditing(false);
              }
            }}
          />
          <Button type="submit" disabled={pending || !name.trim()}>
            {pending ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              setName(category.name);
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        </form>
        {inUse ? (
          <p className="mt-1 text-xs text-muted">
            Renaming updates {category.usageCount} transaction
            {category.usageCount === 1 ? "" : "s"}.
          </p>
        ) : null}
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="truncate font-medium">{category.name}</p>
        <p className="text-sm text-muted">
          {inUse
            ? `${category.usageCount} transaction${category.usageCount === 1 ? "" : "s"}`
            : "Not used on any transaction"}
        </p>
      </div>
      <div className="flex gap-1">
        <Button
          type="button"
          variant="ghost"
          disabled={disabled || pending}
          onClick={() => setEditing(true)}
        >
          Rename
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={disabled || pending || inUse}
          title={inUse ? "Re-categorise or rename its transactions first" : undefined}
          onClick={() => run(() => deleteBankSpendingCategory(category.id))}
        >
          {pending ? "Removing…" : "Remove"}
        </Button>
      </div>
    </li>
  );
}

function CustomCategoriesDialog({
  open,
  categories,
  onClose,
}: {
  open: boolean;
  categories: BankSpendingCategoryRow[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onClose={onClose} title="Custom categories">
      <p className="text-sm text-muted">
        Custom labels appear alongside the built-in categories in every category
        dropdown. Renaming a label updates the transactions that use it.
      </p>

      <form
        className="mt-4 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = await createBankSpendingCategoryAction(name);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setName("");
            router.refresh();
          });
        }}
      >
        <div className="min-w-[12rem] flex-1">
          <Label htmlFor="new-spending-category">New category</Label>
          <Input
            id="new-spending-category"
            value={name}
            maxLength={120}
            placeholder="e.g. Client gifts"
            disabled={pending}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={pending || !name.trim()}>
          {pending ? "Adding…" : "Add"}
        </Button>
      </form>
      <FieldError>{error}</FieldError>

      {categories.length > 0 ? (
        <ul className="mt-4 max-h-[50vh] divide-y divide-border overflow-y-auto pr-1">
          {categories.map((category) => (
            <CustomCategoryRow
              key={`${category.id}:${category.name}`}
              category={category}
              disabled={pending}
              onError={setError}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted">
          No custom categories yet. Add one here, or choose “Custom…” in a
          transaction’s category dropdown.
        </p>
      )}

      <DialogActions>
        <Button type="button" variant="secondary" onClick={onClose}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function ExplainCreditDialog({
  open,
  onClose,
  transactionId,
  incomeCategories,
}: {
  open: boolean;
  onClose: () => void;
  transactionId: string;
  incomeCategories: readonly string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [matchType, setMatchType] = useState<string>("other_income");
  const [incomeCategory, setIncomeCategory] = useState("Interest");
  const [note, setNote] = useState("");
  const categoryOptions = incomeCategorySelectOptions(incomeCategories);

  const handleClose = () => {
    if (!pending) onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} title="Explain credit">
      <p className="text-sm text-muted">
        Mark this incoming payment as other income, a transfer, or tax or loan
        so it leaves the unreconciled list. Client payments should be matched to
        an invoice instead.
      </p>
      <div className="mt-4 space-y-3">
        <div>
          <Label htmlFor="explain-type">Type</Label>
          <Select
            id="explain-type"
            value={matchType}
            onChange={(e) => setMatchType(e.target.value)}
            disabled={pending}
          >
            <option value="other_income">Other income</option>
            <option value="transfer">Transfer</option>
            <option value="tax_or_loan">Tax or loan</option>
          </Select>
        </div>
        {matchType === "other_income" ? (
          <div>
            <Label htmlFor="explain-category">Category</Label>
            <Select
              id="explain-category"
              value={incomeCategory}
              onChange={(e) => setIncomeCategory(e.target.value)}
              disabled={pending}
            >
              {categoryOptions.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        <div>
          <Label htmlFor="explain-note">
            Note{matchType === "other_income" && incomeCategory === "Other" ? " (required)" : " (optional)"}
          </Label>
          <Textarea
            id="explain-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={pending}
            rows={3}
            placeholder="e.g. bank interest for March"
          />
        </div>
      </div>
      <FieldError>{error}</FieldError>
      <DialogActions>
        <Button type="button" variant="ghost" disabled={pending} onClick={handleClose}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await explainBankCreditAction({
                transactionId,
                matchType,
                incomeCategory:
                  matchType === "other_income" ? incomeCategory : null,
                note: note.trim() || null,
              });
              if (!result.ok) {
                setError(result.error ?? "Could not explain credit");
                return;
              }
              router.refresh();
              onClose();
            });
          }}
        >
          {pending ? "Saving…" : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

type ReconciliationRow = {
  id: string;
  amountPence: number;
  matchId: string | null;
  matchType: string | null;
  matchLabel: string | null;
  matchHref: string | null;
  matchNote: string | null;
  confirmed: boolean;
  reconciled: boolean;
  suggested: boolean;
};

type ReconciliationState = "matched" | "explained" | "suggested" | "unreconciled";

const RECONCILIATION_BADGE: Record<ReconciliationState, { label: string; className: string }> = {
  matched: { label: "Matched", className: "bg-success/15 text-success" },
  explained: { label: "Explained", className: "bg-success/15 text-success" },
  suggested: { label: "Suggested", className: "bg-accent/30 text-navy" },
  unreconciled: { label: "Unreconciled", className: "bg-wash text-muted" },
};

function reconciliationState(row: ReconciliationRow): ReconciliationState {
  if (row.reconciled) {
    return isCreditExplainMatchType(row.matchType) ? "explained" : "matched";
  }
  return row.suggested ? "suggested" : "unreconciled";
}

function reconciliationDetail(row: ReconciliationRow): string | null {
  if (!row.reconciled && !row.suggested) return null;
  const parts = [row.matchLabel ?? row.matchType, row.matchNote].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

const iconButton =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-wash hover:text-foreground disabled:pointer-events-none disabled:opacity-50";

type RowMenuItem = { key: string; label: string; onSelect: () => void };

/**
 * Compact overflow menu for a table row. Portalled with fixed positioning so
 * the table's horizontal scroll container cannot clip it.
 */
function RowActionsMenu({
  items,
  disabled,
  label = "More actions",
}: {
  items: RowMenuItem[];
  disabled?: boolean;
  label?: string;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [position, setPosition] = useState<{ top?: number; bottom?: number; right: number } | null>(
    null,
  );

  const close = () => setPosition(null);

  useEffect(() => {
    if (!position) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setPosition(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPosition(null);
        triggerRef.current?.focus();
      }
    };
    const onMove = () => setPosition(null);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [position]);

  useEffect(() => {
    if (position) menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [position]);

  const open = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const right = Math.max(8, window.innerWidth - rect.right);
    // Flip above the trigger near the bottom of the viewport.
    const estimatedHeight = items.length * 36 + 8;
    setPosition(
      window.innerHeight - rect.bottom < estimatedHeight + 12
        ? { bottom: window.innerHeight - rect.top + 4, right }
        : { top: rect.bottom + 4, right },
    );
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={iconButton}
        disabled={disabled}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={position !== null}
        onClick={() => (position ? close() : open())}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>
      {position && triggerRef.current
        ? createPortal(
            <ul
              ref={menuRef}
              role="menu"
              style={{ position: "fixed", zIndex: 100, ...position }}
              className="min-w-max overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg"
            >
              {items.map((item) => (
                <li key={item.key} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full px-3 py-2 text-left text-sm hover:bg-wash focus:bg-wash focus:outline-none"
                    onClick={() => {
                      close();
                      item.onSelect();
                    }}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>,
            overlayPortalTarget(triggerRef.current) ?? document.body,
          )
        : null}
    </>
  );
}

/**
 * Status badge, match detail and row actions in a single compact cell:
 * ✓/✕ for suggestions, Explain for unreconciled credits, ⋯ for the rest.
 */
export function ReconciliationCell({
  row,
  canWrite,
  incomeCategories,
  align = "start",
}: {
  row: ReconciliationRow;
  canWrite: boolean;
  incomeCategories: readonly string[];
  /** "end" right-aligns the cell, e.g. under the amount on a card. */
  align?: "start" | "end";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [explainOpen, setExplainOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = reconciliationState(row);
  const badge = RECONCILIATION_BADGE[state];
  const detail = reconciliationDetail(row);
  const isIncoming = row.amountPence > 0;
  const { matchId } = row;

  const run = (action: () => Promise<ActionResult>) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  let actions: ReactNode = null;
  if (canWrite) {
    if (state === "suggested" && matchId) {
      actions = (
        <>
          <button
            type="button"
            className={cn(iconButton, "text-success hover:text-success")}
            disabled={pending}
            aria-label="Confirm match"
            title="Confirm match"
            onClick={() => run(() => confirmBankMatch(matchId))}
          >
            <Check className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            className={iconButton}
            disabled={pending}
            aria-label="Dismiss suggestion"
            title="Dismiss suggestion"
            onClick={() => run(() => dismissBankMatch(matchId))}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
          {isIncoming ? (
            <RowActionsMenu
              disabled={pending}
              items={[
                { key: "explain", label: "Explain instead…", onSelect: () => setExplainOpen(true) },
              ]}
            />
          ) : null}
        </>
      );
    } else if (state === "unreconciled" && isIncoming) {
      actions = (
        <Button
          type="button"
          variant="ghost"
          className="px-3 py-1"
          disabled={pending}
          onClick={() => setExplainOpen(true)}
        >
          Explain
        </Button>
      );
    } else if (state === "explained" && matchId) {
      actions = (
        <RowActionsMenu
          disabled={pending}
          items={[
            {
              key: "clear",
              label: "Clear explanation",
              onSelect: () => run(() => clearBankCreditExplanationAction(matchId)),
            },
          ]}
        />
      );
    }
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2",
        align === "end" ? "justify-end text-right" : "justify-between",
      )}
    >
      <div className="min-w-0">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
            badge.className,
          )}
        >
          {badge.label}
        </span>
        {detail ? (
          <p
            className={cn(
              "mt-0.5 max-w-[12rem] truncate text-xs text-muted",
              align === "end" && "ml-auto",
            )}
            title={detail}
          >
            {row.matchHref ? (
              <Link
                href={row.matchHref}
                className="underline-offset-2 hover:text-foreground hover:underline"
              >
                {detail}
              </Link>
            ) : (
              detail
            )}
          </p>
        ) : null}
        {error ? <FieldError>{error}</FieldError> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center">{actions}</div> : null}
      {explainOpen ? (
        <ExplainCreditDialog
          open={explainOpen}
          onClose={() => setExplainOpen(false)}
          transactionId={row.id}
          incomeCategories={incomeCategories}
        />
      ) : null}
    </div>
  );
}
