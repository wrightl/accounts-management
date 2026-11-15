"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateBankOpeningBalanceAction } from "@/actions/bank";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/form";
import { toast } from "@/components/ui/toast";

export type BankBalanceAccount = {
  id: string;
  name: string;
  openingBalancePence: number | null;
  openingBalanceDate: string | null;
};

function AccountRow({ account }: { account: BankBalanceAccount }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState(
    account.openingBalancePence != null ? (account.openingBalancePence / 100).toFixed(2) : "",
  );
  const [date, setDate] = useState(account.openingBalanceDate ?? "");

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4">
      <p className="font-medium">{account.name}</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor={`balance-${account.id}`}>Balance (£)</Label>
          <Input
            id={`balance-${account.id}`}
            inputMode="decimal"
            placeholder="0.00"
            value={balance}
            disabled={pending}
            onChange={(e) => setBalance(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor={`balance-date-${account.id}`}>At the end of</Label>
          <Input
            id={`balance-date-${account.id}`}
            type="date"
            value={date}
            disabled={pending}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await updateBankOpeningBalanceAction(account.id, balance, date);
              if (result.ok) {
                toast("Bank balance saved.");
                router.refresh();
              } else {
                setError(result.error);
              }
            });
          }}
        >
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      <FieldError id={`balance-error-${account.id}`}>{error}</FieldError>
    </div>
  );
}

/** One known statement balance per bank account, which the year-end pack needs. */
export function BankOpeningBalances({ accounts }: { accounts: BankBalanceAccount[] }) {
  return (
    <div className="mt-4 space-y-3">
      {accounts.length === 0 ? (
        <p className="text-sm text-muted">
          No bank account yet. One is added when you first import a bank statement.
        </p>
      ) : (
        accounts.map((account) => <AccountRow key={account.id} account={account} />)
      )}
    </div>
  );
}
