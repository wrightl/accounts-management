"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createIncomeCategoryAction,
  deleteIncomeCategoryAction,
} from "@/actions/bank";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/form";
import {
  BUILTIN_INCOME_CATEGORIES,
  type IncomeCategoryRow,
} from "@/lib/bank/income-categories";

export function IncomeCategoriesPanel({
  categories,
}: {
  categories: IncomeCategoryRow[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  return (
    <section className="mt-10 rounded-xl border border-border bg-surface p-4 sm:p-6">
      <h2 className="font-display text-lg font-semibold">
        Other income categories
      </h2>
      <p className="mt-1 text-sm text-muted">
        Built-in categories are always available when explaining a bank credit.
        Add company-specific labels here; co-founders can use them but only
        administrators can create or remove them.
      </p>

      <div className="mt-4">
        <p className="text-sm font-medium">Built-in</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {BUILTIN_INCOME_CATEGORIES.map((c) => (
            <li
              key={c}
              className="rounded-full bg-wash px-3 py-1 text-sm text-muted"
            >
              {c}
            </li>
          ))}
        </ul>
      </div>

      <form
        className="mt-6 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = await createIncomeCategoryAction(name);
            if (!result.ok) {
              setError(result.error ?? "Could not add category");
              return;
            }
            setName("");
            router.refresh();
          });
        }}
      >
        <div className="min-w-[12rem] flex-1">
          <Label htmlFor="income-category-name">Custom category</Label>
          <Input
            id="income-category-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Affiliate commission"
            disabled={pending}
            maxLength={120}
          />
        </div>
        <Button type="submit" disabled={pending || !name.trim()}>
          {pending && !pendingId ? "Adding…" : "Add"}
        </Button>
      </form>
      <FieldError>{error}</FieldError>

      {categories.length > 0 ? (
        <ul className="mt-6 divide-y divide-border">
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
                      ? `${category.usageCount} credit${category.usageCount === 1 ? "" : "s"}`
                      : "Not used yet"}
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
                      const result = await deleteIncomeCategoryAction(
                        category.id,
                      );
                      setPendingId(null);
                      if (!result.ok) {
                        setError(result.error ?? "Could not remove category");
                        return;
                      }
                      router.refresh();
                    });
                  }}
                >
                  {removing ? "Removing…" : "Remove"}
                </Button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted">No custom categories yet.</p>
      )}
    </section>
  );
}
