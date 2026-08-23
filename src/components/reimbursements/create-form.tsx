"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select } from "@/components/ui/form";
import { formatGBP } from "@/lib/money";
import { createReimbursementRun } from "@/actions/reimbursements";

export function CreateReimbursementForm({
  founders,
  expenses,
  initialPayeeUserId,
}: {
  founders: { id: string; name: string | null; email: string }[];
  expenses: {
    id: string;
    description: string;
    amountPence: number;
    spentAt: string | null;
    paidByUserId: string | null;
  }[];
  initialPayeeUserId?: string;
}) {
  const router = useRouter();
  const defaultPayee =
    initialPayeeUserId && founders.some((f) => f.id === initialPayeeUserId)
      ? initialPayeeUserId
      : (founders[0]?.id ?? "");
  const [payeeUserId, setPayeeUserId] = useState(defaultPayee);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const forPayee = useMemo(
    () => expenses.filter((e) => e.paidByUserId === payeeUserId),
    [expenses, payeeUserId],
  );

  const total = useMemo(
    () =>
      forPayee
        .filter((e) => selected.has(e.id))
        .reduce((a, e) => a + e.amountPence, 0),
    [forPayee, selected],
  );

  return (
    <form
      className="space-y-4"
      action={(formData) => {
        formData.set("expenseIdsJson", JSON.stringify([...selected]));
        setError(null);
        startTransition(async () => {
          const result = await createReimbursementRun(formData);
          if (!result.ok) setError(result.error);
          else {
            router.push(`/dashboard/reimbursements/${result.id}`);
            router.refresh();
          }
        });
      }}
    >
      <div>
        <Label htmlFor="payeeUserId">Payee (founder)</Label>
        <Select
          id="payeeUserId"
          name="payeeUserId"
          value={payeeUserId}
          onChange={(e) => {
            setPayeeUserId(e.target.value);
            setSelected(new Set());
          }}
          disabled={pending}
        >
          {founders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name || f.email}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label>Reimbursable expenses</Label>
        {forPayee.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            No reimbursable expenses for this founder.
          </p>
        ) : (
          <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto rounded-lg border border-border p-3">
            {forPayee.map((e) => (
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
      <Button
        type="submit"
        disabled={pending || selected.size === 0 || !reference.trim()}
      >
        {pending ? "Creating…" : "Create reimbursement run"}
      </Button>
    </form>
  );
}
