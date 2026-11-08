"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { History } from "lucide-react";
import {
  previewInvoiceCutover,
  saveInvoiceCutover,
  type InvoiceCutoverPreview,
} from "@/actions/invoice-cutover";
import { DisplayDate } from "@/components/date-format-provider";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/form";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import { formatGBP } from "@/lib/money";

type Preview = Extract<InvoiceCutoverPreview, { ok: true }> & { cutover: string };

function signedGBP(pence: number): string {
  return `${pence > 0 ? "+" : ""}${formatGBP(pence)}`;
}

export function InvoiceCutoverCard({
  cutover,
  maxDate,
  canEdit,
  vatRegistered,
}: {
  cutover: string | null;
  /** Latest date allowed (today). */
  maxDate: string;
  canEdit: boolean;
  /** Without registration there's no VAT to move. */
  vatRegistered: boolean;
}) {
  const router = useRouter();
  const { fieldErrors, error, clearAll, clearField, applyActionResult } = useFieldErrors();
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<Preview | null>(null);

  function review(formData: FormData) {
    clearAll();
    setPreview(null);
    const value = String(formData.get("cutover") ?? "");
    startTransition(async () => {
      const result = await previewInvoiceCutover(formData);
      if (result.ok) setPreview({ ...result, cutover: value });
      else applyActionResult(result);
    });
  }

  function save() {
    if (!preview) return;
    const formData = new FormData();
    formData.set("cutover", preview.cutover);
    clearAll();
    startTransition(async () => {
      const result = await saveInvoiceCutover(formData);
      if (applyActionResult(result) && result.ok) {
        setPreview(null);
        router.refresh();
      }
    });
  }

  return (
    <section className="mt-6 rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-start gap-3">
        <History className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-semibold">
            {cutover ? (
              <>Accounts start from <DisplayDate value={cutover} /></>
            ) : (
              "Imported invoice cutover"
            )}
          </h2>
          <p className="mt-1 text-sm text-muted">
            Imported invoices dated before this date are kept for reference and
            stay in what clients owe you, but are left out of P&amp;L, VAT and
            reserves. Invoices created in Alfa always count.
          </p>

          {canEdit ? (
            <form
              noValidate
              onSubmit={preventResetSubmit(review)}
              className="mt-4 flex flex-wrap items-end gap-3"
            >
              <div>
                <Label htmlFor="cutover">Cutover date (leave blank for none)</Label>
                <Input
                  id="cutover"
                  name="cutover"
                  type="date"
                  max={maxDate}
                  defaultValue={cutover ?? ""}
                  disabled={pending}
                  aria-invalid={Boolean(fieldErrors.cutover)}
                  aria-describedby={fieldErrors.cutover ? "cutover-error" : undefined}
                  onChange={() => {
                    clearField("cutover");
                    setPreview(null);
                  }}
                />
              </div>
              <Button type="submit" variant="ghost" disabled={pending}>
                {pending && !preview ? "Checking…" : "Review change"}
              </Button>
            </form>
          ) : null}
          <FieldError id="cutover-error">{fieldErrors.cutover ?? error}</FieldError>

          {preview ? (
            <div className="mt-4 rounded-xl border border-border p-4 text-sm">
              <ul className="space-y-1">
                <li>{preview.impact.invoicesBroughtForward} invoices leave the accounts</li>
                <li>{preview.impact.invoicesCounted} invoices join the accounts</li>
                <li>Income changes by {signedGBP(preview.impact.incomeChangePence)}</li>
                {vatRegistered ? (
                  <li>VAT changes by {signedGBP(preview.impact.vatChangePence)}</li>
                ) : null}
                <li>{preview.impact.activityChanged} payments, credit notes and refunds change</li>
              </ul>
              {preview.warnings.length > 0 ? (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-muted">
                  {preview.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              ) : null}
              {preview.lockError ? (
                <FieldError id="cutover-lock-error">{preview.lockError}</FieldError>
              ) : (
                <Button type="button" className="mt-3" disabled={pending} onClick={save}>
                  {pending ? "Saving…" : "Save cutover"}
                </Button>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
