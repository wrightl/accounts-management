"use client";

import { Download, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { useAlert } from "@/components/ui/alert-dialog";
import { FieldError, Input, Label } from "@/components/ui/form";
import { scheduleFocusFirstFieldError } from "@/components/ui/focus-first-field-error";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import {
  recordCreditNoteRefund,
  sendCreditNote,
  voidCreditNote,
} from "@/actions/credit-notes";
import {
  creditNoteRefundRawFromFormData,
  parseCreditNoteRefundInput,
} from "@/lib/credit-notes/schema";
import { penceToPounds } from "@/lib/money";
import { SterlingAmountField } from "@/components/documents/sterling-amount-field";

export function CreditNoteActions({
  creditNoteId,
  canWrite,
  canSend,
  sent,
  canVoid,
  /** Refund the client is owed for this note, in its currency; 0 hides "Record refund". */
  refundableMinor,
  currency = "GBP",
  today,
}: {
  creditNoteId: string;
  canWrite: boolean;
  canSend: boolean;
  sent: boolean;
  canVoid: boolean;
  refundableMinor: number;
  /** The credited invoice's currency; a foreign refund also records the pounds paid out. */
  currency?: string;
  today: string;
}) {
  const router = useRouter();
  const { confirm } = useAlert();
  const {
    fieldErrors,
    error,
    clearAll,
    clearField,
    applyFail,
    applyActionResult,
    setError,
  } = useFieldErrors();
  const [pending, startTransition] = useTransition();
  const [showRefund, setShowRefund] = useState(false);
  const foreign = currency !== "GBP";
  const [refundAmount, setRefundAmount] = useState(String(penceToPounds(refundableMinor)));
  const [refundDate, setRefundDate] = useState(today);
  const formRef = useRef<HTMLFormElement>(null);

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    clearAll();
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error ?? "Something went wrong");
      else router.refresh();
    });
  }

  async function onVoid() {
    const ok = await confirm({
      title: "Void credit note",
      message:
        "Void this credit note? Its number stays used, and the invoice balance goes back to what it was before the credit.",
      confirmLabel: "Void",
      variant: "destructive",
    });
    if (ok) run(() => voidCreditNote(creditNoteId));
  }

  function onRefund(formData: FormData) {
    clearAll();
    const parsed = parseCreditNoteRefundInput(creditNoteRefundRawFromFormData(formData));
    if (!parsed.ok) {
      applyFail(parsed);
      scheduleFocusFirstFieldError(formRef.current, parsed.fieldErrors);
      return;
    }
    startTransition(async () => {
      const result = await recordCreditNoteRefund(creditNoteId, formData);
      if (applyActionResult(result) && result.ok) {
        setShowRefund(false);
        router.refresh();
      } else if (!result.ok) {
        scheduleFocusFirstFieldError(formRef.current, result.fieldErrors);
      }
    });
  }

  return (
    <div className="min-w-0 flex-1 space-y-4">
      <div className="flex flex-wrap gap-2">
        <a
          href={`/api/credit-notes/${creditNoteId}/pdf`}
          className={buttonClasses("ghost")}
        >
          <Download className="h-4 w-4" />
          Download PDF
        </a>
        {canWrite && canSend ? (
          <Button
            type="button"
            variant={sent ? "ghost" : "primary"}
            disabled={pending}
            onClick={() => run(() => sendCreditNote(creditNoteId))}
          >
            <Send className="h-4 w-4" />
            {pending ? "Sending…" : sent ? "Resend to client" : "Send to client"}
          </Button>
        ) : null}
        {canWrite && refundableMinor > 0 ? (
          <Button
            type="button"
            variant={sent || !canSend ? "primary" : "ghost"}
            disabled={pending}
            onClick={() => {
              clearAll();
              setShowRefund((v) => !v);
            }}
          >
            Record refund
          </Button>
        ) : null}
        {canWrite && canVoid ? (
          <Button type="button" variant="ghost" disabled={pending} onClick={onVoid}>
            Void
          </Button>
        ) : null}
      </div>
      {error && !showRefund ? <FieldError>{error}</FieldError> : null}

      {showRefund ? (
        <form
          ref={formRef}
          noValidate
          onSubmit={preventResetSubmit(onRefund)}
          className="max-w-xl space-y-3 rounded-xl border border-border bg-surface p-4"
        >
          <p className="text-sm text-muted">
            Record the money you paid back to the client for this credit.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="refund-amount" required>
                {foreign ? `Amount (${currency})` : "Amount £"}
              </Label>
              <Input
                id="refund-amount"
                name="amountPounds"
                inputMode="decimal"
                value={refundAmount}
                disabled={pending}
                aria-invalid={Boolean(fieldErrors.amountPounds)}
                aria-describedby={fieldErrors.amountPounds ? "refund-amount-error" : undefined}
                onChange={(e) => {
                  clearField("amountPounds");
                  setRefundAmount(e.target.value);
                }}
              />
              <FieldError id="refund-amount-error">{fieldErrors.amountPounds}</FieldError>
            </div>
            <div>
              <Label htmlFor="refund-date" required>
                Refunded on
              </Label>
              <Input
                id="refund-date"
                name="refundedAt"
                type="date"
                defaultValue={today}
                disabled={pending}
                aria-invalid={Boolean(fieldErrors.refundedAt)}
                aria-describedby={fieldErrors.refundedAt ? "refund-date-error" : undefined}
                onChange={(e) => {
                  clearField("refundedAt");
                  setRefundDate(e.target.value);
                }}
              />
              <FieldError id="refund-date-error">{fieldErrors.refundedAt}</FieldError>
            </div>
            <div>
              <Label htmlFor="refund-reference">Reference</Label>
              <Input
                id="refund-reference"
                name="reference"
                placeholder="Bank reference"
                disabled={pending}
              />
            </div>
          </div>
          {foreign ? (
            <SterlingAmountField
              id="refund-sterling"
              label="Left your bank (£)"
              currency={currency}
              foreignAmount={refundAmount}
              date={refundDate}
              disabled={pending}
              error={fieldErrors.sterlingPounds}
              onChange={() => clearField("sterlingPounds")}
            />
          ) : null}
          <FieldError>{error}</FieldError>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save refund"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => setShowRefund(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
