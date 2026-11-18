"use client";

import { CircleSlash, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { removeWriteOff, writeOffInvoice } from "@/actions/payments";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/form";
import { scheduleFocusFirstFieldError } from "@/components/ui/focus-first-field-error";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import { useAlert } from "@/components/ui/alert-dialog";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DisplayDate } from "@/components/date-format-provider";
import { penceToPounds } from "@/lib/money";

export type InvoiceWriteOffRow = {
  id: string;
  kindLabel: string;
  amountFormatted: string;
  writtenOffOn: string;
  note: string | null;
};

/**
 * Write-offs on an invoice, and the form to write off what's still owed:
 * bank charges when the client's bank kept a fee, bad debt when it won't be paid.
 */
export function InvoiceWriteOffs({
  invoiceId,
  writeOffs,
  balancePence,
  canWriteOff,
  canWrite,
  today,
}: {
  invoiceId: string;
  writeOffs: InvoiceWriteOffRow[];
  balancePence: number;
  /** The invoice is sent and still has money owing. */
  canWriteOff: boolean;
  canWrite: boolean;
  today: string;
}) {
  const router = useRouter();
  const { confirm, alert } = useAlert();
  const { fieldErrors, error, clearAll, clearField, applyActionResult } = useFieldErrors();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  if (writeOffs.length === 0 && !(canWrite && canWriteOff)) return null;

  return (
    <section className="mt-8">
      <h2 className="mb-3 font-display text-lg font-semibold">Write-offs</h2>
      {writeOffs.length > 0 ? (
        <Table>
          <THead>
            <TR>
              <TH>Date</TH>
              <TH>Reason</TH>
              <TH>Note</TH>
              <TH className="text-right">Amount</TH>
              {canWrite ? <TH className="sr-only">Actions</TH> : null}
            </TR>
          </THead>
          <TBody>
            {writeOffs.map((w) => (
              <TR key={w.id}>
                <TD>
                  <DisplayDate value={w.writtenOffOn} />
                </TD>
                <TD>{w.kindLabel}</TD>
                <TD className="max-w-xs truncate text-muted">{w.note ?? "—"}</TD>
                <TD className="text-right">{w.amountFormatted}</TD>
                {canWrite ? (
                  <TD className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={pending}
                      onClick={async () => {
                        const ok = await confirm({
                          title: "Remove write-off",
                          message: `${w.amountFormatted} will be owed on this invoice again.`,
                          confirmLabel: "Remove",
                        });
                        if (!ok) return;
                        startTransition(async () => {
                          const result = await removeWriteOff(invoiceId, w.id);
                          if (!result.ok) {
                            await alert({ title: "Couldn't remove the write-off", message: result.error });
                            return;
                          }
                          router.refresh();
                        });
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                      Remove
                    </Button>
                  </TD>
                ) : null}
              </TR>
            ))}
          </TBody>
        </Table>
      ) : (
        <p className="text-sm text-muted">
          If the client paid slightly less than the invoice, or won&apos;t pay the rest, write off
          what&apos;s left so the invoice is settled. For an agreed discount, raise a credit note
          instead.
        </p>
      )}

      {canWrite && canWriteOff ? (
        open ? (
          <form
            ref={formRef}
            noValidate
            className="mt-4 max-w-lg space-y-3 rounded-xl border border-border p-4"
            onSubmit={preventResetSubmit((formData) => {
              clearAll();
              startTransition(async () => {
                const result = await writeOffInvoice(invoiceId, formData);
                if (applyActionResult(result)) {
                  setOpen(false);
                  router.refresh();
                } else if (!result.ok) {
                  scheduleFocusFirstFieldError(formRef.current, result.fieldErrors);
                }
              });
            })}
          >
            <div>
              <Label htmlFor="writeOffKind" required>
                Reason
              </Label>
              <select
                id="writeOffKind"
                name="kind"
                defaultValue="bank_charges"
                disabled={pending}
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              >
                <option value="bank_charges">Bank charges (the client&apos;s bank kept a fee)</option>
                <option value="bad_debt">Bad debt (the rest won&apos;t be paid)</option>
              </select>
            </div>
            <div>
              <Label htmlFor="writeOffAmount" required>
                Amount (£)
              </Label>
              <Input
                id="writeOffAmount"
                name="amountPounds"
                defaultValue={String(penceToPounds(balancePence))}
                disabled={pending}
                aria-invalid={Boolean(fieldErrors.amountPounds)}
                aria-describedby={fieldErrors.amountPounds ? "writeOffAmount-error" : undefined}
                onChange={() => clearField("amountPounds")}
              />
              <FieldError id="writeOffAmount-error">{fieldErrors.amountPounds}</FieldError>
            </div>
            <div>
              <Label htmlFor="writeOffDate" required>
                Date
              </Label>
              <Input
                id="writeOffDate"
                name="writtenOffOn"
                type="date"
                defaultValue={today}
                disabled={pending}
                aria-invalid={Boolean(fieldErrors.writtenOffOn)}
                onChange={() => clearField("writtenOffOn")}
              />
              <FieldError>{fieldErrors.writtenOffOn}</FieldError>
            </div>
            <div>
              <Label htmlFor="writeOffNote">Note</Label>
              <Input id="writeOffNote" name="note" disabled={pending} />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Write off"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  clearAll();
                  setOpen(false);
                }}
              >
                Cancel
              </Button>
            </div>
            <FieldError>{error}</FieldError>
          </form>
        ) : (
          <Button type="button" variant="secondary" className="mt-3" onClick={() => setOpen(true)}>
            <CircleSlash className="h-4 w-4" />
            Write off balance
          </Button>
        )
      ) : null}
    </section>
  );
}
