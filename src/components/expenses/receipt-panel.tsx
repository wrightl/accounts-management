"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/form";
import { deleteReceipt, uploadReceipt } from "@/actions/expenses";

export function ReceiptPanel({
  expenseId,
  receipts,
  canWrite,
}: {
  expenseId: string;
  receipts: {
    id: string;
    filename: string;
    contentType: string | null;
    sizeBytes: number | null;
  }[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-semibold">Receipts</h2>
      {receipts.length === 0 ? (
        <p className="text-sm text-muted">No receipts uploaded.</p>
      ) : (
        <ul className="space-y-2">
          {receipts.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"
            >
              <a
                href={`/api/receipts/${r.id}`}
                className="text-brand hover:underline"
              >
                {r.filename}
              </a>
              {canWrite && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      const result = await deleteReceipt(r.id);
                      if (!result.ok) setError(result.error);
                      else router.refresh();
                    });
                  }}
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canWrite && (
        <form
          className="flex flex-wrap items-end gap-3"
          action={(formData) => {
            setError(null);
            startTransition(async () => {
              const result = await uploadReceipt(expenseId, formData);
              if (!result.ok) setError(result.error);
              else router.refresh();
            });
          }}
        >
          <div className="flex-1">
            <Label htmlFor="receipt">Upload receipt</Label>
            <Input
              id="receipt"
              name="receipt"
              type="file"
              accept="image/*,application/pdf"
              required
              disabled={pending}
            />
          </div>
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "Uploading…" : "Upload"}
          </Button>
        </form>
      )}
      <FieldError>{error}</FieldError>
    </div>
  );
}
