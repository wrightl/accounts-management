"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateInvoiceStatus } from "@/actions/invoices";
import {
  allowedInvoiceTransitions,
  statusLabel,
  type InvoiceStatus,
} from "@/lib/invoices/status";
import { StatusBadge } from "@/components/ui/badge";
import { useAlert } from "@/components/ui/alert-dialog";
import { FieldError, Select } from "@/components/ui/form";

export function InvoiceStatusSelect({
  invoiceId,
  status,
  canWrite,
}: {
  invoiceId: string;
  status: InvoiceStatus;
  canWrite: boolean;
}) {
  const router = useRouter();
  const { confirm } = useAlert();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const transitions = allowedInvoiceTransitions(status);

  if (!canWrite || transitions.length === 0) {
    return <StatusBadge status={status} />;
  }

  async function onChange(next: string) {
    if (next === status) return;

    setError(null);

    if (next === "void") {
      const ok = await confirm({
        title: "Void invoice",
        message: "Void this invoice?",
        confirmLabel: "Void",
        variant: "destructive",
      });
      if (!ok) return;
    }

    startTransition(async () => {
      const result = await updateInvoiceStatus(invoiceId, next);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-1">
      <Select
        aria-label="Invoice status"
        value={status}
        disabled={pending}
        onChange={(e) => onChange(e.target.value)}
        className="w-auto min-w-[140px]"
      >
        <option value={status}>{statusLabel(status)}</option>
        {transitions.map((target) => (
          <option key={target} value={target}>
            {statusLabel(target)}
          </option>
        ))}
      </Select>
      <FieldError>{error}</FieldError>
    </div>
  );
}
