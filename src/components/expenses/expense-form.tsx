"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { EXPENSE_CATEGORIES } from "@/lib/expenses/categories";
import { createExpense, updateExpense, deleteExpense } from "@/actions/expenses";
import { penceToPounds } from "@/lib/money";

export function ExpenseForm({
  mode,
  expense,
  founders,
  clients,
  canWrite,
}: {
  mode: "create" | "edit";
  expense?: {
    id: string;
    description: string;
    category: string | null;
    spentAt: string | null;
    amountPence: number;
    status: string;
    billable: boolean;
    billableClientId: string | null;
    paidByUserId: string | null;
  };
  founders: { id: string; name: string | null; email: string }[];
  clients: { id: string; name: string }[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [billable, setBillable] = useState(expense?.billable ?? false);

  if (!canWrite && mode === "create") {
    return <p className="text-sm text-muted">You do not have permission to create expenses.</p>;
  }

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createExpense(formData)
          : await updateExpense(expense!.id, formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/dashboard/expenses/${result.id}`);
      router.refresh();
    });
  }

  return (
    <form action={onSubmit} className="mx-auto max-w-xl space-y-4">
      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          required
          defaultValue={expense?.description ?? ""}
          disabled={!canWrite || pending}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="category">Category</Label>
          <Select
            id="category"
            name="category"
            defaultValue={expense?.category ?? ""}
            disabled={!canWrite || pending}
          >
            <option value="">Select…</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="spentAt">Date</Label>
          <Input
            id="spentAt"
            name="spentAt"
            type="date"
            defaultValue={expense?.spentAt ?? new Date().toISOString().slice(0, 10)}
            disabled={!canWrite || pending}
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="amountPounds">Amount (£)</Label>
          <Input
            id="amountPounds"
            name="amountPounds"
            required
            defaultValue={
              expense ? String(penceToPounds(expense.amountPence)) : ""
            }
            disabled={!canWrite || pending}
          />
        </div>
        <div>
          <Label htmlFor="status">Status</Label>
          <Select
            id="status"
            name="status"
            defaultValue={
              expense?.status === "reimbursed" ? "reimbursable" : expense?.status ?? "recorded"
            }
            disabled={!canWrite || pending || expense?.status === "reimbursed"}
          >
            <option value="recorded">Recorded</option>
            <option value="reimbursable">Reimbursable</option>
            <option value="company_paid">Company paid</option>
          </Select>
        </div>
      </div>
      <div>
        <Label htmlFor="paidByUserId">Paid by</Label>
        <Select
          id="paidByUserId"
          name="paidByUserId"
          defaultValue={expense?.paidByUserId ?? ""}
          disabled={!canWrite || pending}
        >
          <option value="">Select founder…</option>
          {founders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name || f.email}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <input
          id="billable"
          name="billable"
          type="checkbox"
          value="true"
          checked={billable}
          onChange={(e) => setBillable(e.target.checked)}
          disabled={!canWrite || pending}
          className="h-4 w-4"
        />
        <Label htmlFor="billable" className="mb-0">
          Billable to client
        </Label>
      </div>
      {billable && (
        <div>
          <Label htmlFor="billableClientId">Client</Label>
          <Select
            id="billableClientId"
            name="billableClientId"
            defaultValue={expense?.billableClientId ?? ""}
            disabled={!canWrite || pending}
          >
            <option value="">Select client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      )}
      <FieldError>{error}</FieldError>
      {canWrite && (
        <div className="flex gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : mode === "create" ? "Create expense" : "Save changes"}
          </Button>
          {mode === "edit" && expense?.status !== "reimbursed" && (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                if (!confirm("Delete this expense?")) return;
                startTransition(async () => {
                  const result = await deleteExpense(expense!.id);
                  if (!result.ok) setError(result.error);
                  else {
                    router.push("/dashboard/expenses");
                    router.refresh();
                  }
                });
              }}
            >
              Delete
            </Button>
          )}
        </div>
      )}
    </form>
  );
}
