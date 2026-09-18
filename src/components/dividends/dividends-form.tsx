"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useAlert } from "@/components/ui/alert-dialog";
import { FieldError, Input, Label, Textarea } from "@/components/ui/form";
import { FormStickyActions } from "@/components/ui/form-sticky-actions";
import { scheduleFocusFirstFieldError } from "@/components/ui/focus-first-field-error";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import {
  declareDividend,
  deleteDividendDeclaration,
} from "@/actions/dividends";
import {
  dividendRawFromFormData,
  parseDeclareDividendInput,
} from "@/lib/dividends/schema";
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
  const {
    fieldErrors,
    error,
    clearAll,
    clearField,
    applyFail,
    applyActionResult,
  } = useFieldErrors();
  const formRef = useRef<HTMLFormElement>(null);
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
        <Link href="/shareholders" className="underline">
          Manage shareholders
        </Link>
      </p>
    );
  }

  return (
    <form
      ref={formRef}
      noValidate
      className="max-w-lg space-y-4"
      onSubmit={preventResetSubmit((formData) => {
        formData.set("amountPounds", amountPounds);
        clearAll();
        const clientParsed = parseDeclareDividendInput(
          dividendRawFromFormData(formData),
        );
        if (!clientParsed.ok) {
          applyFail(clientParsed);
          scheduleFocusFirstFieldError(
            formRef.current,
            clientParsed.fieldErrors,
          );
          return;
        }
        startTransition(async () => {
          const result = await declareDividend(formData);
          if (applyActionResult(result)) {
            router.push("/dividends");
          } else if (!result.ok) {
            scheduleFocusFirstFieldError(formRef.current, result.fieldErrors);
          }
        });
      })}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="declaredAt" required>
            Date
          </Label>
          <Input
            id="declaredAt"
            name="declaredAt"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            disabled={pending}
            aria-invalid={Boolean(fieldErrors.declaredAt)}
            aria-describedby={
              fieldErrors.declaredAt ? "declaredAt-error" : undefined
            }
            onChange={() => clearField("declaredAt")}
          />
          <FieldError id="declaredAt-error">{fieldErrors.declaredAt}</FieldError>
        </div>
        <div>
          <Label htmlFor="amountPounds" required>
            Total amount (£)
          </Label>
          <Input
            id="amountPounds"
            name="amountPounds"
            required
            value={amountPounds}
            onChange={(e) => {
              setAmountPounds(e.target.value);
              clearField("amountPounds");
            }}
            disabled={pending}
            aria-invalid={Boolean(fieldErrors.amountPounds)}
            aria-describedby={
              fieldErrors.amountPounds ? "amountPounds-error" : undefined
            }
          />
          <FieldError id="amountPounds-error">
            {fieldErrors.amountPounds}
          </FieldError>
        </div>
      </div>
      <div>
        <Label htmlFor="notes">Notes (optional)</Label>
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

      <FormStickyActions error={error}>
        <Button type="submit" disabled={pending}>
          Declare dividend
        </Button>
      </FormStickyActions>
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
