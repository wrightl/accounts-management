"use client";

import { Download, PoundSterling, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/form";
import { scheduleFocusFirstFieldError } from "@/components/ui/focus-first-field-error";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import { sendInvoice } from "@/actions/invoices";
import { useAlert } from "@/components/ui/alert-dialog";
import { findInvoiceBankMatches, type InvoiceBankMatch } from "@/actions/bank";
import { recordPayment } from "@/actions/payments";
import {
  parsePaymentInput,
  paymentRawFromFormData,
} from "@/lib/payments/schema";
import type { MatchScoreBreakdown } from "@/lib/bank/match";
import { formatGBP, penceToPounds } from "@/lib/money";
import { SterlingAmountField } from "@/components/documents/sterling-amount-field";
import { DisplayDate, useDateFormat } from "@/components/date-format-provider";
import { formatIsoDate } from "@/lib/dates";

function MatchBreakdown({ breakdown }: { breakdown: MatchScoreBreakdown }) {
  const parts: string[] = [];
  if (breakdown.invoiceRefScore > 0) parts.push(`invoice ref ${breakdown.invoiceRefScore}%`);
  if (breakdown.counterpartyScore > 0) parts.push(`client ${breakdown.counterpartyScore}%`);
  if (parts.length === 0) return null;
  return <p className="text-xs text-muted">Match: {parts.join(" · ")}</p>;
}

/** Explains what happens when the bank payment isn't exactly the balance due. */
function AmountDifference({
  receivedPence,
  balancePence,
}: {
  receivedPence: number;
  balancePence: number;
}) {
  const diff = receivedPence - balancePence;
  if (diff === 0) return null;
  return (
    <p className="mt-2 text-sm text-warning">
      {diff > 0
        ? `${formatGBP(diff)} more than the balance due. The extra will show as a refund due to the client.`
        : `${formatGBP(-diff)} less than the balance due. The rest will stay owed on the invoice.`}
    </p>
  );
}

export function InvoiceActions({
  invoiceId,
  invoiceNumber,
  status,
  canWrite,
  balanceFormatted,
  balancePence,
  currency = "GBP",
  clientName,
  companyName,
  isImported = false,
  extraActions,
}: {
  invoiceId: string;
  invoiceNumber: string;
  status: string;
  canWrite: boolean;
  balanceFormatted: string;
  /** What the client still owes in the invoice's currency, to explain a bank payment that differs from it. */
  balancePence?: number;
  /** The invoice's currency; payments on a foreign invoice also record the sterling received. */
  currency?: string;
  clientName: string;
  companyName: string | null;
  /** Sending an imported invoice emails a client about something issued elsewhere. */
  isImported?: boolean;
  /** More buttons for the same row, shown between Download PDF and the payment and send buttons. */
  extraActions?: ReactNode;
}) {
  const router = useRouter();
  const {
    fieldErrors,
    error,
    clearAll,
    clearField,
    applyFail,
    applyActionResult,
    setError,
  } = useFieldErrors();
  const { confirm } = useAlert();
  const [pending, startTransition] = useTransition();
  const dateFormat = useDateFormat();
  const [showPayment, setShowPayment] = useState(false);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [matches, setMatches] = useState<InvoiceBankMatch[]>([]);
  const [otherReceipts, setOtherReceipts] = useState<InvoiceBankMatch[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [manualEntry, setManualEntry] = useState(false);
  const matchRequestId = useRef(0);
  const formRef = useRef<HTMLFormElement>(null);

  const selectedMatch =
    [...matches, ...otherReceipts].find((m) => m.bankTransactionId === selectedMatchId) ?? null;
  const selectedIsSuggested = matches.some((m) => m.bankTransactionId === selectedMatchId);

  function chooseReceipt(id: string) {
    if (!id) return;
    setSelectedMatchId(id);
    setManualEntry(false);
  }

  /** Every receipt the user can link, suggestions first, as one dropdown. */
  function receiptSelect(id: string, label: string, placeholder: string | null) {
    const option = (m: InvoiceBankMatch) => (
      <option key={m.bankTransactionId} value={m.bankTransactionId}>
        {formatIsoDate(m.bookedAt, dateFormat)} · {m.counterparty ?? "Unknown"} · {m.amountFormatted}
      </option>
    );
    return (
      <div className="mt-3">
        <Label htmlFor={id}>{label}</Label>
        <select
          id={id}
          className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
          value={placeholder === null ? (selectedMatchId ?? "") : ""}
          onChange={(e) => chooseReceipt(e.target.value)}
        >
          {placeholder !== null ? <option value="">{placeholder}</option> : null}
          {matches.length > 0 ? (
            <optgroup label="Suggested">{matches.map(option)}</optgroup>
          ) : null}
          {otherReceipts.length > 0 ? (
            <optgroup label="Other unlinked receipts">{otherReceipts.map(option)}</optgroup>
          ) : null}
        </select>
      </div>
    );
  }

  function togglePayment() {
    if (showPayment) {
      matchRequestId.current += 1;
      setShowPayment(false);
      return;
    }

    setShowPayment(true);
    setLoadingMatches(true);
    clearAll();
    const requestId = ++matchRequestId.current;
    void findInvoiceBankMatches(invoiceId).then((result) => {
      if (requestId !== matchRequestId.current) return;
      setLoadingMatches(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMatches(result.matches);
      setOtherReceipts(result.others);
      const best = result.matches[0];
      if (best) {
        setSelectedMatchId(best.bankTransactionId);
        setManualEntry(false);
      } else {
        setSelectedMatchId(null);
        setManualEntry(true);
      }
    });
  }

  // Typed since the chosen receipt last changed (see inputsKey below).
  const [typedAmount, setTypedAmount] = useState<{ key: string; value: string } | null>(null);
  const [typedDate, setTypedDate] = useState<{ key: string; value: string } | null>(null);

  if (!canWrite) return null;

  function refresh() {
    router.refresh();
  }

  const foreign = currency !== "GBP";
  const linked = Boolean(selectedMatch && !manualEntry);
  // A bank line is sterling. On a foreign invoice it doesn't say what the
  // client paid in their currency, so that starts at the balance due.
  const defaultAmount = linked
    ? foreign
      ? balancePence !== undefined
        ? String(penceToPounds(balancePence))
        : ""
      : String(penceToPounds(selectedMatch!.amountPence))
    : "";
  // The inputs reset (by key) when the chosen receipt changes; track what was
  // typed since, for the pounds field's check.
  const inputsKey = `${selectedMatchId ?? "manual"}-${manualEntry}`;
  const defaultReference =
    selectedMatch && !manualEntry ? (selectedMatch.reference ?? "") : "";
  const defaultReceivedAt =
    selectedMatch && !manualEntry ? selectedMatch.bookedAt : "";
  const amountNow = typedAmount?.key === inputsKey ? typedAmount.value : defaultAmount;
  const dateNow = typedDate?.key === inputsKey ? typedDate.value : defaultReceivedAt;

  return (
    <div className="min-w-0 flex-1 space-y-4">
      <div className="flex flex-wrap gap-2">
        <a href={`/api/invoices/${invoiceId}/pdf`} className={buttonClasses("ghost")}>
          <Download className="h-4 w-4" />
          Download PDF
        </a>
        {extraActions}
        {(status === "draft" || status === "sent" || status === "overdue") && (
          <Button
            type="button"
            // Pink while it is a draft; once sent, recording payment is the main job.
            variant={status === "draft" ? "primary" : "ghost"}
            disabled={pending}
            onClick={async () => {
              if (isImported) {
                const ok = await confirm({
                  title: "Email this imported invoice",
                  message: `${clientName} will be emailed about ${invoiceNumber}, which you issued before using Alfa.`,
                  confirmLabel: "Send email",
                });
                if (!ok) return;
              }
              clearAll();
              startTransition(async () => {
                const result = await sendInvoice(invoiceId, { confirmedImported: isImported });
                if (!result.ok) setError(result.error);
                else refresh();
              });
            }}
          >
            <Send className="h-4 w-4" />
            {pending ? "Sending…" : status === "draft" ? "Send invoice" : "Resend invoice"}
          </Button>
        )}
        {(status === "sent" || status === "overdue") && (
          <Button
            type="button"
            disabled={pending}
            onClick={togglePayment}
          >
            <PoundSterling className="h-4 w-4" />
            Record payment
          </Button>
        )}
      </div>

      {showPayment && (
        <form
          ref={formRef}
          noValidate
          className="max-w-lg space-y-3 rounded-xl border border-border p-4"
          onSubmit={preventResetSubmit((formData) => {
            clearAll();
            const clientParsed = parsePaymentInput(paymentRawFromFormData(formData));
            if (!clientParsed.ok) {
              applyFail(clientParsed);
              scheduleFocusFirstFieldError(
                formRef.current,
                clientParsed.fieldErrors,
              );
              return;
            }
            startTransition(async () => {
              const result = await recordPayment(invoiceId, formData);
              if (applyActionResult(result)) {
                setShowPayment(false);
                refresh();
              } else if (!result.ok) {
                scheduleFocusFirstFieldError(
                  formRef.current,
                  result.fieldErrors,
                );
              }
            });
          })}
        >
          <p className="text-sm text-muted">
            Balance due: {balanceFormatted} · {invoiceNumber} ·{" "}
            {companyName?.trim() || clientName}
          </p>

          {loadingMatches ? (
            <p className="text-sm text-muted">Searching bank transactions…</p>
          ) : selectedMatch && !manualEntry ? (
            <div className="rounded-xl border border-border bg-wash/40 p-3">
              <p className="text-sm font-medium">
                {selectedIsSuggested ? "Identified bank payment" : "Chosen bank payment"}
              </p>
              <p className="mt-1 text-sm">
                {selectedMatch.counterparty ?? "Unknown"} · {selectedMatch.amountFormatted}
              </p>
              <p className="text-sm text-muted">
                <DisplayDate value={selectedMatch.bookedAt} />
                {selectedMatch.reference ? ` · ${selectedMatch.reference}` : ""}
              </p>
              <MatchBreakdown breakdown={selectedMatch.breakdown} />
              {balancePence !== undefined && !foreign ? (
                <AmountDifference
                  receivedPence={selectedMatch.amountPence}
                  balancePence={balancePence}
                />
              ) : null}
              <input
                type="hidden"
                name="bankTransactionId"
                value={selectedMatch.bankTransactionId}
              />
              {matches.length + otherReceipts.length > 1
                ? receiptSelect("bankMatch", "Change receipt", null)
                : null}
              <Button
                type="button"
                variant="ghost"
                className="mt-2"
                onClick={() => {
                  setManualEntry(true);
                  setSelectedMatchId(null);
                }}
              >
                Enter manually instead
              </Button>
            </div>
          ) : (
            <div>
              <p className="text-sm text-muted">
                {matches.length > 0
                  ? "Enter payment details manually, or link a bank receipt."
                  : otherReceipts.length > 0
                    ? "No bank transaction matched this invoice. Link a bank receipt below, or enter payment details manually."
                    : "No matching bank transaction found. Enter payment details manually."}
              </p>
              {matches.length + otherReceipts.length > 0
                ? receiptSelect("bankReceipt", "Link a bank receipt", "Choose a receipt…")
                : null}
            </div>
          )}

          <div>
            <Label htmlFor="amountPounds" required>
              {foreign ? `Amount received (${currency})` : "Amount (£)"}
            </Label>
            <Input
              id="amountPounds"
              name="amountPounds"
              key={`amount-${selectedMatchId ?? "manual"}-${manualEntry}`}
              defaultValue={defaultAmount || (manualEntry ? "" : undefined)}
              disabled={pending || (!foreign && linked)}
              aria-invalid={Boolean(fieldErrors.amountPounds)}
              aria-describedby={
                fieldErrors.amountPounds ? "amountPounds-error" : undefined
              }
              onChange={(e) => {
                clearField("amountPounds");
                setTypedAmount({ key: inputsKey, value: e.target.value });
              }}
            />
            <FieldError id="amountPounds-error">{fieldErrors.amountPounds}</FieldError>
          </div>
          {foreign ? (
            linked ? (
              <p className="text-sm text-muted">
                Reached your bank: {selectedMatch!.amountFormatted}. The difference from the
                invoice&apos;s rate is booked as an exchange gain or loss.
              </p>
            ) : (
              <SterlingAmountField
                id="sterlingPounds"
                label="Reached your bank (£)"
                currency={currency}
                foreignAmount={amountNow}
                date={dateNow}
                disabled={pending}
                error={fieldErrors.sterlingPounds}
                onChange={() => clearField("sterlingPounds")}
              />
            )
          ) : null}
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
            <Input
              id="reference"
              name="reference"
              key={`ref-${selectedMatchId ?? "manual"}-${manualEntry}`}
              defaultValue={defaultReference}
              disabled={pending}
            />
          </div>
          <div>
            <Label htmlFor="receivedAt">Received</Label>
            <Input
              id="receivedAt"
              name="receivedAt"
              type="date"
              key={`date-${selectedMatchId ?? "manual"}-${manualEntry}`}
              defaultValue={defaultReceivedAt}
              disabled={pending}
              onChange={(e) => setTypedDate({ key: inputsKey, value: e.target.value })}
            />
          </div>
          {manualEntry && selectedMatch ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setManualEntry(false);
                setSelectedMatchId(matches[0]?.bankTransactionId ?? null);
              }}
            >
              Use identified payment
            </Button>
          ) : null}
          <Button type="submit" disabled={pending || loadingMatches}>
            {pending ? "Saving…" : "Save payment"}
          </Button>
        </form>
      )}

      <FieldError>{error}</FieldError>
    </div>
  );
}
