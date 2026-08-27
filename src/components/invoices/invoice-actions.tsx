"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/form";
import { sendInvoice } from "@/actions/invoices";
import { findInvoiceBankMatches, type InvoiceBankMatch } from "@/actions/bank";
import { recordPayment } from "@/actions/payments";
import type { MatchScoreBreakdown } from "@/lib/bank/match";
import { penceToPounds } from "@/lib/money";

function MatchBreakdown({ breakdown }: { breakdown: MatchScoreBreakdown }) {
  const parts: string[] = [];
  if (breakdown.invoiceRefScore > 0) parts.push(`invoice ref ${breakdown.invoiceRefScore}%`);
  if (breakdown.counterpartyScore > 0) parts.push(`client ${breakdown.counterpartyScore}%`);
  if (parts.length === 0) return null;
  return <p className="text-xs text-muted">Match: {parts.join(" · ")}</p>;
}

export function InvoiceActions({
  invoiceId,
  invoiceNumber,
  status,
  canWrite,
  balanceFormatted,
  clientName,
  companyName,
}: {
  invoiceId: string;
  invoiceNumber: string;
  status: string;
  canWrite: boolean;
  balanceFormatted: string;
  clientName: string;
  companyName: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [showPayment, setShowPayment] = useState(false);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [matches, setMatches] = useState<InvoiceBankMatch[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [manualEntry, setManualEntry] = useState(false);
  const matchRequestId = useRef(0);

  const selectedMatch = matches.find((m) => m.bankTransactionId === selectedMatchId) ?? null;

  function togglePayment() {
    if (showPayment) {
      matchRequestId.current += 1;
      setShowPayment(false);
      return;
    }

    setShowPayment(true);
    setLoadingMatches(true);
    setError(null);
    const requestId = ++matchRequestId.current;
    void findInvoiceBankMatches(invoiceId).then((result) => {
      if (requestId !== matchRequestId.current) return;
      setLoadingMatches(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMatches(result.matches);
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

  if (!canWrite) return null;

  function refresh() {
    router.refresh();
  }

  const defaultAmount =
    selectedMatch && !manualEntry
      ? String(penceToPounds(selectedMatch.amountPence))
      : "";
  const defaultReference =
    selectedMatch && !manualEntry ? (selectedMatch.reference ?? "") : "";
  const defaultReceivedAt =
    selectedMatch && !manualEntry ? selectedMatch.bookedAt : "";

  return (
    <div className="min-w-0 flex-1 space-y-4">
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
            onClick={togglePayment}
          >
            Record payment
          </Button>
        )}
      </div>

      {showPayment && (
        <form
          className="max-w-lg space-y-3 rounded-xl border border-border p-4"
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
          <p className="text-sm text-muted">
            Balance due: {balanceFormatted} · {invoiceNumber} ·{" "}
            {companyName?.trim() || clientName}
          </p>

          {loadingMatches ? (
            <p className="text-sm text-muted">Searching bank transactions…</p>
          ) : selectedMatch && !manualEntry ? (
            <div className="rounded-lg border border-border bg-wash/40 p-3">
              <p className="text-sm font-medium">Identified bank payment</p>
              <p className="mt-1 text-sm">
                {selectedMatch.counterparty ?? "Unknown"} · {selectedMatch.amountFormatted}
              </p>
              <p className="text-sm text-muted">
                {selectedMatch.bookedAt}
                {selectedMatch.reference ? ` · ${selectedMatch.reference}` : ""}
              </p>
              <MatchBreakdown breakdown={selectedMatch.breakdown} />
              <input
                type="hidden"
                name="bankTransactionId"
                value={selectedMatch.bankTransactionId}
              />
              {matches.length > 1 ? (
                <div className="mt-3">
                  <Label htmlFor="bankMatch">Other matches</Label>
                  <select
                    id="bankMatch"
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                    value={selectedMatchId ?? ""}
                    onChange={(e) => setSelectedMatchId(e.target.value || null)}
                  >
                    {matches.map((m) => (
                      <option key={m.bankTransactionId} value={m.bankTransactionId}>
                        {m.bookedAt} · {m.counterparty ?? "Unknown"} · {m.amountFormatted}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
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
            <p className="text-sm text-muted">
              No matching bank transaction found. Enter payment details manually.
            </p>
          )}

          <div>
            <Label htmlFor="amountPounds">Amount (£)</Label>
            <Input
              id="amountPounds"
              name="amountPounds"
              key={`amount-${selectedMatchId ?? "manual"}-${manualEntry}`}
              defaultValue={defaultAmount || (manualEntry ? "" : undefined)}
              required
              disabled={pending || (!manualEntry && Boolean(selectedMatch))}
            />
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
