"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useAlert } from "@/components/ui/alert-dialog";
import { FieldError, Label, Select } from "@/components/ui/form";
import { findReimbursementBankMatchesAction } from "@/actions/bank";
import { markReimbursementPaid } from "@/actions/reimbursements";
import type { ReimbursementBankMatch } from "@/lib/bank/queries";

export function ReimbursementActions({
  id,
  status,
  canWrite,
}: {
  id: string;
  status: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const { confirm } = useAlert();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [matches, setMatches] = useState<ReimbursementBankMatch[] | null>(null);
  const [selectedMatchId, setSelectedMatchId] = useState<string>("");
  const loadingMatches = matches === null && status === "pending" && canWrite;

  useEffect(() => {
    if (status !== "pending" || !canWrite) return;
    let cancelled = false;
    void findReimbursementBankMatchesAction(id).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setMatches(result.matches);
        if (result.matches[0]) {
          setSelectedMatchId(result.matches[0].bankTransactionId);
        }
      } else {
        setMatches([]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id, status, canWrite]);

  function markPaid(bankTransactionId?: string) {
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      if (bankTransactionId) formData.set("bankTransactionId", bankTransactionId);
      const result = await markReimbursementPaid(id, formData);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <a href={`/api/reimbursements/${id}/export`}>
          <Button type="button" variant="secondary">
            Export CSV
          </Button>
        </a>
        {canWrite && status === "pending" && (
          <>
            {matches && matches.length > 0 && (
              <div className="flex min-w-[240px] flex-col gap-1">
                <Label htmlFor="bankMatch">Link bank transaction</Label>
                <Select
                  id="bankMatch"
                  value={selectedMatchId}
                  onChange={(e) => setSelectedMatchId(e.target.value)}
                  disabled={pending || loadingMatches}
                >
                  {matches.map((m) => (
                    <option key={m.bankTransactionId} value={m.bankTransactionId}>
                      {m.bookedAt} · {m.amountFormatted}
                      {m.counterparty ? ` · ${m.counterparty}` : ""}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <Button
              type="button"
              disabled={pending || (Boolean(matches?.length) && !selectedMatchId)}
              onClick={async () => {
                const ok = await confirm({
                  title: "Mark as paid",
                  message: selectedMatchId
                    ? "Mark this reimbursement as paid and link the bank transaction?"
                    : "Mark this reimbursement as paid?",
                  confirmLabel: "Mark as paid",
                });
                if (!ok) return;
                markPaid(selectedMatchId || undefined);
              }}
            >
              {pending ? "Saving…" : "Mark as paid"}
            </Button>
          </>
        )}
      </div>
      {loadingMatches && status === "pending" && (
        <p className="text-xs text-muted">Looking for matching bank transactions…</p>
      )}
      <FieldError>{error}</FieldError>
    </div>
  );
}
