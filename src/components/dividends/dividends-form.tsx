"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useAlert } from "@/components/ui/alert-dialog";
import { FieldError, Input, Label, Textarea } from "@/components/ui/form";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import {
  declareDividend,
  deleteDividendDeclaration,
} from "@/actions/dividends";
import { splitDividendPence } from "@/lib/dividends/split";
import { formatGBP, poundsToPence } from "@/lib/money";

type Holder = { id: string; name: string; shareCount: number };

export function DividendDeclareForm({
  canWrite,
  balanced,
  totalShares,
  shareholders,
  registerError,
}: {
  canWrite: boolean;
  balanced: boolean;
  totalShares: number | null;
  shareholders: Holder[];
  registerError?: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [amountPounds, setAmountPounds] = useState("");

  const preview = useMemo(() => {
    if (!balanced || !totalShares || shareholders.length === 0) return null;
    const raw = amountPounds.trim();
    if (!raw) return null;
    try {
      const totalPence = poundsToPence(raw);
      if (totalPence <= 0) return null;
      return splitDividendPence(totalPence, shareholders, totalShares);
    } catch {
      return null;
    }
  }, [amountPounds, balanced, totalShares, shareholders]);

  if (!canWrite) {
    return (
      <p className="text-sm text-muted">
        You do not have permission to declare dividends.
      </p>
    );
  }

  if (!balanced) {
    return (
      <p className="mt-4 text-sm text-muted">
        {registerError ??
          "Set up a balanced shareholders register (total shares must equal the sum of active share counts) before declaring a dividend."}{" "}
        <a href="/dashboard/shareholders" className="underline">
          Manage shareholders
        </a>
      </p>
    );
  }

  return (
    <form
      className="max-w-lg space-y-4"
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          const result = await declareDividend(formData);
          if (!result.ok) setError(result.error);
          else router.push("/dashboard/dividends");
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="declaredAt">Date</Label>
          <Input
            id="declaredAt"
            name="declaredAt"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            disabled={pending}
          />
        </div>
        <div>
          <Label htmlFor="amountPounds">Total amount (£)</Label>
          <Input
            id="amountPounds"
            name="amountPounds"
            required
            value={amountPounds}
            onChange={(e) => setAmountPounds(e.target.value)}
            disabled={pending}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" rows={2} disabled={pending} />
      </div>

      {preview && (
        <div>
          <h2 className="mb-2 text-sm font-medium">Split preview</h2>
          <Table>
            <THead>
              <TR>
                <TH>Shareholder</TH>
                <TH className="text-right">Shares</TH>
                <TH className="text-right">Amount</TH>
              </TR>
            </THead>
            <TBody>
              {preview.map((p) => (
                <TR key={p.id}>
                  <TD>{p.name}</TD>
                  <TD className="text-right">{p.shareCount}</TD>
                  <TD className="text-right">{formatGBP(p.amountPence)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}

      <FieldError>{error}</FieldError>
      <Button type="submit" disabled={pending || !amountPounds.trim()}>
        Declare dividend
      </Button>
    </form>
  );
}

export function DeleteDividendDeclarationButton({
  id,
  canWrite,
}: {
  id: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const { confirm } = useAlert();
  const [pending, startTransition] = useTransition();
  if (!canWrite) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      disabled={pending}
      onClick={async () => {
        const ok = await confirm({
          title: "Delete declaration",
          message: "Delete this dividend declaration and all payouts?",
          confirmLabel: "Delete",
          variant: "destructive",
        });
        if (!ok) return;
        startTransition(async () => {
          await deleteDividendDeclaration(id);
          router.refresh();
        });
      }}
    >
      Delete
    </Button>
  );
}
