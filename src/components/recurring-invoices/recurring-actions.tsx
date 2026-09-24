"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/form";
import { useAlert } from "@/components/ui/alert-dialog";
import {
  deleteRecurringInvoice,
  generateRecurringInvoiceNow,
  setRecurringInvoiceEnabled,
} from "@/actions/recurring-invoices";

export function RecurringInvoiceActions({
  id,
  enabled,
  canWrite,
}: {
  id: string;
  enabled: boolean;
  canWrite: boolean;
}) {
  const router = useRouter();
  const { confirm } = useAlert();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canWrite) return null;

  function run(action: () => Promise<{ ok: boolean; error?: string; id?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Something went wrong");
        router.refresh();
        return;
      }
      if (result.id && result.id !== id) {
        router.push(`/invoices/${result.id}`);
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => run(() => setRecurringInvoiceEnabled(id, !enabled))}
        >
          {enabled ? "Pause" : "Resume"}
        </Button>
        <Button
          type="button"
          disabled={pending || !enabled}
          onClick={async () => {
            const ok = await confirm({
              title: "Generate invoice now?",
              message:
                "Generate an invoice for this schedule now? Only once per calendar month.",
              confirmLabel: "Generate",
            });
            if (!ok) return;
            run(() => generateRecurringInvoiceNow(id));
          }}
          title={!enabled ? "Resume the schedule first" : undefined}
        >
          Generate now
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={async () => {
            const ok = await confirm({
              title: "Delete schedule?",
              message:
                "Delete this schedule? Templates with generated invoices are paused instead.",
              confirmLabel: "Delete",
              variant: "destructive",
            });
            if (!ok) return;
            run(async () => {
              const result = await deleteRecurringInvoice(id);
              if (result.ok) {
                router.push("/recurring-invoices");
              }
              return result;
            });
          }}
        >
          Delete
        </Button>
      </div>
      <FieldError>{error}</FieldError>
    </div>
  );
}
