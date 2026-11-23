"use client";

import { Link2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { findReceiptsForPayment, linkPaymentToBank } from "@/actions/payments";
import type { LinkableReceipt } from "@/lib/payments/link-bank";
import { Button } from "@/components/ui/button";
import { FieldError, Label } from "@/components/ui/form";
import { useDateFormat } from "@/components/date-format-provider";
import { formatIsoDate } from "@/lib/dates";
import { formatGBP } from "@/lib/money";

/**
 * Link a payment already on the invoice (for example one from an invoice
 * import) to the bank credit that paid it. If the bank amount differs, the
 * payment is changed to what was received.
 */
export function PaymentBankLink({
  invoiceId,
  paymentId,
  paymentPence,
}: {
  invoiceId: string;
  paymentId: string;
  paymentPence: number;
}) {
  const router = useRouter();
  const dateFormat = useDateFormat();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [receipts, setReceipts] = useState<LinkableReceipt[]>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const requestId = useRef(0);

  function openPicker() {
    setOpen(true);
    setLoading(true);
    setError(null);
    const id = ++requestId.current;
    void findReceiptsForPayment(paymentId).then((result) => {
      if (id !== requestId.current) return;
      setLoading(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setReceipts(result.receipts);
      setSelected(result.receipts[0]?.bankTransactionId ?? "");
    });
  }

  if (!open) {
    return (
      <Button type="button" variant="ghost" onClick={openPicker}>
        <Link2 className="h-4 w-4" />
        Link bank receipt
      </Button>
    );
  }

  const chosen = receipts.find((r) => r.bankTransactionId === selected) ?? null;
  const diff = chosen ? chosen.amountPence - paymentPence : 0;
  const selectId = `payment-${paymentId}-receipt`;

  return (
    <div className="min-w-64 space-y-2 text-left">
      {loading ? (
        <p className="text-sm text-muted">Looking for bank receipts…</p>
      ) : receipts.length === 0 ? (
        <p className="text-sm text-muted">No unlinked bank receipt could be this payment.</p>
      ) : (
        <>
          <div>
            <Label htmlFor={selectId}>Bank receipt</Label>
            <select
              id={selectId}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              value={selected}
              disabled={pending}
              onChange={(e) => setSelected(e.target.value)}
            >
              {receipts.map((r) => (
                <option key={r.bankTransactionId} value={r.bankTransactionId}>
                  {formatIsoDate(r.bookedAt, dateFormat)} · {r.counterparty ?? r.reference ?? "Unknown"} ·{" "}
                  {r.amountFormatted}
                </option>
              ))}
            </select>
          </div>
          {diff !== 0 ? (
            <p className="text-xs text-warning">
              The payment will change to the {chosen?.amountFormatted} received (
              {diff > 0 ? `${formatGBP(diff)} more` : `${formatGBP(-diff)} less`}).
              {diff > 0
                ? " Anything over the invoice total shows as a refund due."
                : " The rest will be owed on the invoice; you can write it off."}
            </p>
          ) : null}
        </>
      )}
      <div className="flex gap-2">
        {receipts.length > 0 ? (
          <Button
            type="button"
            disabled={pending || !selected}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await linkPaymentToBank(invoiceId, paymentId, selected);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setOpen(false);
                router.refresh();
              })
            }
          >
            {pending ? "Linking…" : "Link"}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            requestId.current += 1;
            setOpen(false);
          }}
        >
          Cancel
        </Button>
      </div>
      <FieldError>{error}</FieldError>
    </div>
  );
}
