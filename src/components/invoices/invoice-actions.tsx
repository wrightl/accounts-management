"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/form";
import { sendInvoice, voidInvoice } from "@/actions/invoices";
import { recordPayment } from "@/actions/payments";

export function InvoiceActions({
  invoiceId,
  status,
  canWrite,
  balanceFormatted,
}: {
  invoiceId: string;
  status: string;
  canWrite: boolean;
  balanceFormatted: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [showPayment, setShowPayment] = useState(false);

  if (!canWrite) return null;

  function refresh() {
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <a href={`/api/invoices/${invoiceId}/pdf`}>
          <Button type="button" variant="secondary" disabled={pending}>
            Download PDF
          </Button>
        </a>
        {(status === "draft" || status === "sent" || status === "overdue") && (
          <Button
            type="button"
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await sendInvoice(invoiceId);
                if (!result.ok) setError(result.error);
                else refresh();
              });
            }}
          >
            {pending ? "Sending…" : status === "draft" ? "Send invoice" : "Resend invoice"}
          </Button>
        )}
        {(status === "sent" || status === "overdue") && (
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => setShowPayment((v) => !v)}
          >
            Record payment
          </Button>
        )}
        {status === "draft" && (
          <a href={`/dashboard/invoices/${invoiceId}/edit`}>
            <Button type="button" variant="secondary" disabled={pending}>
              Edit
            </Button>
          </a>
        )}
        {status !== "void" && status !== "paid" && (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              if (!confirm("Void this invoice?")) return;
              setError(null);
              startTransition(async () => {
                const result = await voidInvoice(invoiceId);
                if (!result.ok) setError(result.error);
                else refresh();
              });
            }}
          >
            Void
          </Button>
        )}
      </div>

      {showPayment && (
        <form
          className="max-w-md space-y-3 rounded-xl border border-border p-4"
          action={(formData) => {
            setError(null);
            startTransition(async () => {
              const result = await recordPayment(invoiceId, formData);
              if (!result.ok) setError(result.error);
              else {
                setShowPayment(false);
                refresh();
              }
            });
          }}
        >
          <p className="text-sm text-muted">Balance due: {balanceFormatted}</p>
          <div>
            <Label htmlFor="amountPounds">Amount (£)</Label>
            <Input id="amountPounds" name="amountPounds" required disabled={pending} />
          </div>
          <div>
            <Label htmlFor="method">Method</Label>
            <Input
              id="method"
              name="method"
              defaultValue="bank_transfer"
              disabled={pending}
            />
          </div>
          <div>
            <Label htmlFor="reference">Reference</Label>
            <Input id="reference" name="reference" disabled={pending} />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save payment"}
          </Button>
        </form>
      )}

      <FieldError>{error}</FieldError>
    </div>
  );
}
