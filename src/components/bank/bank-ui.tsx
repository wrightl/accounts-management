"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { FieldError, Input, Label, Select } from "@/components/ui/form";
import {
  confirmBankMatch,
  deleteBankSpendingCategory,
  dismissBankMatch,
  importStarlingCsv,
  runSuggestMatches,
  updateBankCategory,
} from "@/actions/bank";
import {
  bankCategorySelectOptions,
  formatBankCategory,
  isSelectableBankCategory,
} from "@/lib/bank/categories";
import type { BankSpendingCategoryRow } from "@/lib/bank/spending-categories";

export function BankImportForm({ onSuccess }: { onSuccess?: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-3"
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
            onSuccess?.();
          }
        });
      }}
    >
      <div>
        <Label htmlFor="csv">Statement file</Label>
        <Input id="csv" name="csv" type="file" accept=".csv,text/csv" required disabled={pending} />
      </div>
      <FieldError>{error}</FieldError>
      {message && <p className="text-sm text-success">{message}</p>}
      <DialogActions>
        <Button type="submit" disabled={pending}>
          {pending ? "Importing…" : "Import"}
        </Button>
      </DialogActions>
    </form>
  );
}

export function BankToolbar({ canWrite }: { canWrite: boolean }) {
  const router = useRouter();
  const [importOpen, setImportOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  if (!canWrite) return null;
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
              await runSuggestMatches();
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
        title="Import Starling CSV"
      >
        <BankImportForm onSuccess={() => setImportOpen(false)} />
      </Dialog>
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
