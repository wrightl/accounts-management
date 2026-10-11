"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Textarea } from "@/components/ui/form";
import { FormStickyActions } from "@/components/ui/form-sticky-actions";
import { scheduleFocusFirstFieldError } from "@/components/ui/focus-first-field-error";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import { formatGBP, invoiceTotals, poundsToPence } from "@/lib/money";
import { createCreditNote } from "@/actions/credit-notes";
import {
  creditNoteRawFromFormData,
  parseCreditNoteInput,
} from "@/lib/credit-notes/schema";
import {
  VatRateField,
  choiceFromVatRate,
  vatRateFromChoice,
  type VatRateFieldValue,
} from "@/components/documents/vat-rate-field";
import { Plus, Trash2 } from "lucide-react";

export interface CreditNoteLineDraft {
  key: string;
  description: string;
  quantity: string;
  unitPricePounds: string;
  /** Percent off the line; blank for no discount. */
  discountPercent: string;
  vatRate: number;
}

function newLine(defaultVatRate: number): CreditNoteLineDraft {
  return {
    key: crypto.randomUUID(),
    description: "",
    quantity: "1",
    unitPricePounds: "",
    discountPercent: "",
    vatRate: defaultVatRate,
  };
}

export function CreditNoteForm({
  invoiceId,
  invoiceNumber,
  initialLines,
  creditablePence,
  vatEnabled,
  defaultIssueDate,
}: {
  invoiceId: string;
  invoiceNumber: string;
  /** Prefilled from the invoice so a full credit is one click. */
  initialLines: CreditNoteLineDraft[];
  /** Gross still available to credit on the invoice. */
  creditablePence: number;
  /** Whether the invoice charged VAT (credit reverses it at the same rates). */
  vatEnabled: boolean;
  defaultIssueDate: string;
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
  const lineDefault = vatEnabled ? (initialLines[0]?.vatRate ?? 0) : 0;
  const [lines, setLines] = useState<CreditNoteLineDraft[]>(
    initialLines.length > 0 ? initialLines : [newLine(lineDefault)],
  );

  const totals = useMemo(() => {
    try {
      return invoiceTotals(
        lines
          .filter((l) => l.description.trim() && l.unitPricePounds.trim())
          .map((l) => ({
            quantity: Number(l.quantity) || 0,
            unitPricePence: poundsToPence(l.unitPricePounds || "0"),
            discountPercent: Number(l.discountPercent) || 0,
            vatRate: vatEnabled ? l.vatRate : 0,
          })),
      );
    } catch {
      return { netPence: 0, vatPence: 0, grossPence: 0 };
    }
  }, [lines, vatEnabled]);
  const overLimit = totals.grossPence > creditablePence;

  function onSubmit(formData: FormData) {
    clearAll();
    formData.set(
      "linesJson",
      JSON.stringify(
        lines.map((l) => ({
          description: l.description,
          quantity: Number(l.quantity),
          unitPricePounds: l.unitPricePounds,
          discountPercent:
            l.discountPercent.trim() === "" ? 0 : Number(l.discountPercent),
          vatRate: vatEnabled ? l.vatRate : 0,
        })),
      ),
    );
    const clientParsed = parseCreditNoteInput(creditNoteRawFromFormData(formData));
    if (!clientParsed.ok) {
      applyFail(clientParsed);
      scheduleFocusFirstFieldError(formRef.current, clientParsed.fieldErrors);
      return;
    }
    startTransition(async () => {
      const result = await createCreditNote(invoiceId, formData);
      if (applyActionResult(result) && result.ok) {
        router.push(`/credit-notes/${result.id}`);
        router.refresh();
      } else if (!result.ok) {
        scheduleFocusFirstFieldError(formRef.current, result.fieldErrors);
      }
    });
  }

  function updateLine(index: number, patch: Partial<CreditNoteLineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function setLineVat(index: number, value: VatRateFieldValue) {
    updateLine(index, { vatRate: vatRateFromChoice(value) });
  }

  function clearLineField(index: number, field: string) {
    clearField(`lines.${index}.${field}`);
  }

  const lineGrid = vatEnabled
    ? "sm:grid-cols-[1fr_70px_100px_80px_110px_2.5rem]"
    : "sm:grid-cols-[1fr_80px_120px_80px_2.5rem]";

  return (
    <form ref={formRef} noValidate onSubmit={preventResetSubmit(onSubmit)} className="mx-auto max-w-3xl space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="issueDate" required>
            Issue date
          </Label>
          <Input
            id="issueDate"
            name="issueDate"
            type="date"
            defaultValue={defaultIssueDate}
            disabled={pending}
            aria-invalid={Boolean(fieldErrors.issueDate)}
            aria-describedby={fieldErrors.issueDate ? "issueDate-error" : undefined}
            onChange={() => clearField("issueDate")}
          />
          <FieldError id="issueDate-error">{fieldErrors.issueDate}</FieldError>
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="reason" required>
            Reason for credit
          </Label>
          <Textarea
            id="reason"
            name="reason"
            rows={2}
            placeholder="e.g. Workshop day cancelled by agreement"
            disabled={pending}
            aria-invalid={Boolean(fieldErrors.reason)}
            aria-describedby={fieldErrors.reason ? "reason-error" : "reason-hint"}
            onChange={() => clearField("reason")}
          />
          <p id="reason-hint" className="mt-1 text-xs text-muted">
            Shown on the credit note your client receives.
          </p>
          <FieldError id="reason-error">{fieldErrors.reason}</FieldError>
        </div>
      </div>

      <div className="space-y-2">
        <Label required>Lines to credit</Label>
        <p className="text-sm text-muted">
          These start as a full credit of {invoiceNumber}. Remove lines or lower
          quantities or prices for a partial credit.
        </p>
        <FieldError id="lines-error">{fieldErrors.lines}</FieldError>
        <div className={`hidden gap-2 text-xs font-medium text-muted sm:grid ${lineGrid}`}>
          <span>Description</span>
          <span>Qty</span>
          <span>Unit £ (ex VAT)</span>
          <span>Disc %</span>
          {vatEnabled ? <span>VAT</span> : null}
          <span className="sr-only">Remove</span>
        </div>
        {lines.map((line, index) => {
          const descKey = `lines.${index}.description`;
          const qtyKey = `lines.${index}.quantity`;
          const priceKey = `lines.${index}.unitPricePounds`;
          const discountKey = `lines.${index}.discountPercent`;
          return (
            <div key={line.key} className={`grid gap-2 ${lineGrid}`}>
              <div className="min-w-0">
                <Input
                  placeholder="Description"
                  aria-label="Description"
                  value={line.description}
                  disabled={pending}
                  aria-invalid={Boolean(fieldErrors[descKey])}
                  aria-describedby={
                    fieldErrors[descKey] ? `line-${index}-description-error` : undefined
                  }
                  onChange={(e) => {
                    clearLineField(index, "description");
                    updateLine(index, { description: e.target.value });
                  }}
                />
                <FieldError id={`line-${index}-description-error`}>
                  {fieldErrors[descKey]}
                </FieldError>
              </div>
              <div className="min-w-0">
                <Input
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  placeholder="Qty"
                  aria-label="Quantity"
                  value={line.quantity}
                  disabled={pending}
                  aria-invalid={Boolean(fieldErrors[qtyKey])}
                  aria-describedby={
                    fieldErrors[qtyKey] ? `line-${index}-quantity-error` : undefined
                  }
                  onChange={(e) => {
                    clearLineField(index, "quantity");
                    updateLine(index, { quantity: e.target.value });
                  }}
                />
                <FieldError id={`line-${index}-quantity-error`}>
                  {fieldErrors[qtyKey]}
                </FieldError>
              </div>
              <div className="min-w-0">
                <Input
                  placeholder="£ unit"
                  aria-label="Unit price"
                  value={line.unitPricePounds}
                  disabled={pending}
                  aria-invalid={Boolean(fieldErrors[priceKey])}
                  aria-describedby={
                    fieldErrors[priceKey] ? `line-${index}-unitPrice-error` : undefined
                  }
                  onChange={(e) => {
                    clearLineField(index, "unitPricePounds");
                    updateLine(index, { unitPricePounds: e.target.value });
                  }}
                />
                <FieldError id={`line-${index}-unitPrice-error`}>
                  {fieldErrors[priceKey]}
                </FieldError>
              </div>
              <div className="min-w-0">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  inputMode="decimal"
                  placeholder="0"
                  aria-label="Discount %"
                  value={line.discountPercent}
                  disabled={pending}
                  aria-invalid={Boolean(fieldErrors[discountKey])}
                  aria-describedby={
                    fieldErrors[discountKey] ? `line-${index}-discount-error` : undefined
                  }
                  onChange={(e) => {
                    clearLineField(index, "discountPercent");
                    updateLine(index, { discountPercent: e.target.value });
                  }}
                />
                <FieldError id={`line-${index}-discount-error`}>
                  {fieldErrors[discountKey]}
                </FieldError>
              </div>
              {vatEnabled ? (
                <VatRateField
                  id={`vat-${line.key}`}
                  label=""
                  compact
                  value={choiceFromVatRate(line.vatRate)}
                  onChange={(v) => setLineVat(index, v)}
                  disabled={pending}
                />
              ) : null}
              <Button
                type="button"
                variant="ghost"
                className="size-9 shrink-0 px-0"
                disabled={pending || lines.length === 1}
                onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                aria-label="Remove line"
                title={lines.length === 1 ? "At least one line is required" : "Remove line"}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => setLines((prev) => [...prev, newLine(lineDefault)])}
        >
          <Plus className="h-4 w-4" />
          Add line
        </Button>
        <div className="space-y-1 text-right">
          {vatEnabled && totals.vatPence > 0 ? (
            <>
              <p className="text-sm text-muted">Net {formatGBP(totals.netPence)}</p>
              <p className="text-sm text-muted">VAT {formatGBP(totals.vatPence)}</p>
            </>
          ) : null}
          <p className="font-display text-lg font-semibold">
            Total credit {formatGBP(totals.grossPence)}
          </p>
          <p className={`text-sm ${overLimit ? "text-destructive" : "text-muted"}`}>
            {overLimit
              ? `More than the ${formatGBP(creditablePence)} left to credit on ${invoiceNumber}`
              : `Up to ${formatGBP(creditablePence)} can be credited on ${invoiceNumber}`}
          </p>
        </div>
      </div>

      <FormStickyActions error={error}>
        <Button type="submit" disabled={pending || overLimit}>
          {pending ? "Issuing…" : "Issue credit note"}
        </Button>
      </FormStickyActions>
    </form>
  );
}
