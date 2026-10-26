"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { FieldError, Input, Label } from "@/components/ui/form";
import { updateBankAccountCardsAction } from "@/actions/bank";
import type { BankAccountCards } from "@/lib/bank/company-cards";

/**
 * The last four digits of each company card. A receipt emailed in that shows
 * one of these was paid by the company; any other card, by the sender.
 */
export function CompanyCardsDialog({
  open,
  accounts,
  onClose,
}: {
  open: boolean;
  accounts: BankAccountCards[];
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Company cards">
      <p className="text-sm text-muted">
        Add the last 4 digits of the cards that pay from each account. When an
        emailed receipt shows one of these cards, the expense is suggested as
        company paid. Any other card suggests the sender paid personally.
      </p>
      {accounts.length > 0 ? (
        <ul className="mt-4 space-y-4">
          {accounts.map((account) => (
            <CompanyCardsRow key={`${account.id}:${account.cardLast4s.join(",")}`} account={account} />
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted">
          Import a bank statement first, then add the cards for that account here.
        </p>
      )}
      <DialogActions>
        <Button type="button" variant="secondary" onClick={onClose}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function CompanyCardsRow({ account }: { account: BankAccountCards }) {
  const router = useRouter();
  const saved = account.cardLast4s.join(", ");
  const [value, setValue] = useState(saved);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputId = `company-cards-${account.id}`;

  return (
    <li>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = await updateBankAccountCardsAction(account.id, value);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        <div className="min-w-[12rem] flex-1">
          <Label htmlFor={inputId}>{account.name}</Label>
          <Input
            id={inputId}
            value={value}
            inputMode="numeric"
            maxLength={200}
            placeholder="e.g. 1234, 5678"
            disabled={pending}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${inputId}-error` : undefined}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <Button type="submit" variant="secondary" disabled={pending || value === saved}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </form>
      <FieldError id={`${inputId}-error`}>{error}</FieldError>
    </li>
  );
}
