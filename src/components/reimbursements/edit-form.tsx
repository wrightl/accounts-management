"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/form";
import { formatGBP } from "@/lib/money";
import { updateReimbursementRun } from "@/actions/reimbursements";

export function EditReimbursementForm({
  id,
  payeeLabel,
  expenses,
  initialExpenseIds,
  initialReference,
}: {
  id: string;
  payeeLabel: string;
  expenses: {
    id: string;
    description: string;
    amountPence: number;
    spentAt: string | null;
  }[];
  initialExpenseIds: string[];
  initialReference: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(initialExpenseIds));
  const [reference, setReference] = useState(initialReference);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const total = useMemo(
    () =>
      expenses
        .filter((e) => selected.has(e.id))
        .reduce((a, e) => a + e.amountPence, 0),
    [expenses, selected],
  );

  return (
    <form
      className="max-w-xl space-y-4"
      action={(formData) => {
        formData.set("expenseIdsJson", JSON.stringify([...selected]));
        setError(null);
        startTransition(async () => {
          const result = await updateReimbursementRun(id, formData);
          if (!result.ok) setError(result.error);
          else {
            router.push(`/dashboard/reimbursements/${id}`);
            router.refresh();
          }
        });
      }}
    >
      <div>
        <Label>Payee (founder)</Label>
        <p className="mt-1 text-sm text-foreground">{payeeLabel}</p>
      </div>

      <div>
        <Label>Reimbursable expenses</Label>
        {expenses.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            No reimbursable expenses available for this founder.
          </p>
        ) : (
          <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto rounded-lg border border-border p-3">
            {expenses.map((e) => (
              <li key={e.id} className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={selected.has(e.id)}
                  onChange={(ev) => {
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (ev.target.checked) next.add(e.id);
                      else next.delete(e.id);
                      return next;
                    });
                  }}
                  disabled={pending}
                />
                <span className="flex-1">
                  {e.spentAt ?? "—"} · {e.description}
                </span>
                <span className="font-medium">{formatGBP(e.amountPence)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <Label htmlFor="reference">Bank payment reference</Label>
        <Input
          id="reference"
          name="reference"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Use this reference when transferring from the business account"
          required
          disabled={pending}
        />
      </div>

      <p className="text-sm text-muted">Total: {formatGBP(total)}</p>
      <FieldError>{error}</FieldError>
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          disabled={pending || selected.size === 0 || !reference.trim()}
        >
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => router.push(`/dashboard/reimbursements/${id}`)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
