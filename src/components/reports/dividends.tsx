"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useAlert } from "@/components/ui/alert-dialog";
import { FieldError, Input, Label, Textarea } from "@/components/ui/form";
import { createDividend, deleteDividend } from "@/actions/dividends";

export function DividendForm({ canWrite }: { canWrite: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canWrite) return null;

  return (
    <form
      className="mt-4 max-w-md space-y-3"
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          const result = await createDividend(formData);
          if (!result.ok) setError(result.error);
          else router.refresh();
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="declaredAt">Date</Label>
          <Input
            id="declaredAt"
            name="declaredAt"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            disabled={pending}
          />
        </div>
        <div>
          <Label htmlFor="amountPounds">Amount (£)</Label>
          <Input id="amountPounds" name="amountPounds" required disabled={pending} />
        </div>
      </div>
      <div>
        <Label htmlFor="shareholderName">Shareholder</Label>
        <Input id="shareholderName" name="shareholderName" required disabled={pending} />
      </div>
      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" rows={2} disabled={pending} />
      </div>
      <FieldError>{error}</FieldError>
      <Button type="submit" disabled={pending}>
        Add dividend
      </Button>
    </form>
  );
}

export function DeleteDividendButton({
  id,
  canWrite,
}: {
  id: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const { confirm } = useAlert();
  const [pending, startTransition] = useTransition();
  if (!canWrite) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      disabled={pending}
      onClick={async () => {
        const ok = await confirm({
          title: "Delete dividend",
          message: "Delete this dividend record?",
          confirmLabel: "Delete",
          variant: "destructive",
        });
        if (!ok) return;
        startTransition(async () => {
          await deleteDividend(id);
          router.refresh();
        });
      }}
    >
      Delete
    </Button>
  );
}
