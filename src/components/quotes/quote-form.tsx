"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { FormStickyActions } from "@/components/ui/form-sticky-actions";
import { scheduleFocusFirstFieldError } from "@/components/ui/focus-first-field-error";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import { formatGBP, invoiceTotals, lineNetPence, poundsToPence } from "@/lib/money";
import { PaymentScheduleEditor } from "@/components/quotes/payment-schedule-editor";
import { createQuote, updateQuote } from "@/actions/quotes";
import { parseQuoteInput, quoteRawFromFormData } from "@/lib/quotes/schema";
import { clientDisplayName } from "@/lib/clients/display";
import {
  VatRateField,
  choiceFromVatRate,
  vatRateFromChoice,
  type VatRateFieldValue,
} from "@/components/documents/vat-rate-field";
import { Plus, Trash2 } from "lucide-react";

export type QuoteLineDraft = {
  key: string;
  description: string;
  quantity: string;
  unitPricePounds: string;
  vatRate: number;
};

function newLine(defaultVatRate: number): QuoteLineDraft {
  return {
    key: crypto.randomUUID(),
    description: "",
    quantity: "1",
    unitPricePounds: "",
    vatRate: defaultVatRate,
  };
}

function isCompleteLine(line: QuoteLineDraft): boolean {
  return line.description.trim().length > 0 && line.unitPricePounds.trim().length > 0;
}

function lineTotalPence(line: QuoteLineDraft): number | null {
  if (!isCompleteLine(line)) return null;
  try {
    return lineNetPence({
      quantity: Number(line.quantity) || 0,
      unitPricePence: poundsToPence(line.unitPricePounds),
    });
  } catch {
    return null;
  }
}

export function QuoteForm({
  mode,
  clients,
  quote,
  initialLines,
  initialMilestones,
  vatRegistered = false,
  defaultVatRate = 0,
}: {
  mode: "create" | "edit";
  clients: { id: string; name: string; companyName?: string | null }[];
  quote?: {
    id: string;
    clientId: string;
    issueDate: string | null;
    validUntil: string | null;
    notes: string | null;
  };
  initialLines?: QuoteLineDraft[];
  initialMilestones?: Array<{
    label: string;
    amountPence: number | null;
    percentBasisPoints: number | null;
    dueDate: string | null;
    dueInDays: number | null;
  }>;
  vatRegistered?: boolean;
  defaultVatRate?: number;
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
  const lineDefault = vatRegistered ? defaultVatRate : 0;
  const [lines, setLines] = useState<QuoteLineDraft[]>(
    initialLines && initialLines.length > 0
      ? initialLines.map((l) => ({
          ...l,
          vatRate: vatRegistered ? l.vatRate : 0,
        }))
      : [newLine(lineDefault)],
  );

  const totals = useMemo(() => {
    try {
      return invoiceTotals(
        lines
          .filter(isCompleteLine)
          .map((l) => ({
            quantity: Number(l.quantity) || 0,
            unitPricePence: poundsToPence(l.unitPricePounds),
            vatRate: vatRegistered ? l.vatRate : 0,
          })),
      );
    } catch {
      return { netPence: 0, vatPence: 0, grossPence: 0 };
    }
  }, [lines, vatRegistered]);

  function setLineVat(index: number, value: VatRateFieldValue) {
    setLines((prev) =>
      prev.map((l, i) =>
        i === index ? { ...l, vatRate: vatRateFromChoice(value) } : l,
      ),
    );
  }

  function clearLineField(index: number, field: string) {
    clearField(`lines.${index}.${field}`);
  }

  function onSubmit(formData: FormData) {
    clearAll();
    formData.set(
      "linesJson",
      JSON.stringify(
        lines.map((l) => ({
          description: l.description,
          quantity: Number(l.quantity),
          unitPricePounds: l.unitPricePounds,
          vatRate: vatRegistered ? l.vatRate : 0,
        })),
      ),
    );
    const clientParsed = parseQuoteInput(quoteRawFromFormData(formData));
    if (!clientParsed.ok) {
      applyFail(clientParsed);
      scheduleFocusFirstFieldError(formRef.current, clientParsed.fieldErrors);
      return;
    }
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createQuote(formData)
          : await updateQuote(quote!.id, formData);
      if (applyActionResult(result) && result.ok) {
        router.push(`/quotes/${result.id}`);
        router.refresh();
      } else if (!result.ok) {
        scheduleFocusFirstFieldError(formRef.current, result.fieldErrors);
      }
    });
  }

  const lineGrid = vatRegistered
    ? "sm:grid-cols-[1fr_70px_100px_110px_90px_2.5rem]"
    : "sm:grid-cols-[1fr_70px_100px_90px_2.5rem]";

  return (
    <form ref={formRef} noValidate className="space-y-4" onSubmit={preventResetSubmit(onSubmit)}>
      <div>
        <Label htmlFor="clientId" required>
          Client
        </Label>
        <Select
          id="clientId"
          name="clientId"
          defaultValue={quote?.clientId ?? ""}
          disabled={pending}
          aria-invalid={Boolean(fieldErrors.clientId)}
          aria-describedby={fieldErrors.clientId ? "clientId-error" : undefined}
          onChange={() => clearField("clientId")}
        >
          <option value="">Select…</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {clientDisplayName(c)}
            </option>
          ))}
        </Select>
        <FieldError id="clientId-error">{fieldErrors.clientId}</FieldError>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="issueDate" required>
            Issue date
          </Label>
          <Input
            id="issueDate"
            name="issueDate"
            type="date"
            defaultValue={
              quote?.issueDate ?? new Date().toISOString().slice(0, 10)
            }
            disabled={pending}
            aria-invalid={Boolean(fieldErrors.issueDate)}
            aria-describedby={fieldErrors.issueDate ? "issueDate-error" : undefined}
            onChange={() => clearField("issueDate")}
          />
          <FieldError id="issueDate-error">{fieldErrors.issueDate}</FieldError>
        </div>
        <div>
          <Label htmlFor="validUntil">Valid until</Label>
          <Input
            id="validUntil"
            name="validUntil"
            type="date"
            defaultValue={quote?.validUntil ?? ""}
            disabled={pending}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label required>Line items</Label>
        <FieldError id="lines-error">{fieldErrors.lines}</FieldError>
        <div
          className={`hidden gap-2 text-xs font-medium text-muted sm:grid ${lineGrid}`}
        >
          <span>Description</span>
          <span>Qty</span>
          <span>Unit £ (ex VAT)</span>
          {vatRegistered ? <span>VAT</span> : null}
          <span className="text-right">Total</span>
          <span className="sr-only">Remove</span>
        </div>
        {lines.map((line, index) => {
          const totalPence = lineTotalPence(line);
          const descKey = `lines.${index}.description`;
          const qtyKey = `lines.${index}.quantity`;
          const priceKey = `lines.${index}.unitPricePounds`;
          return (
            <div key={line.key} className={`grid gap-2 ${lineGrid}`}>
              <div className="min-w-0">
                <Input
                  placeholder="Description"
                  value={line.description}
                  disabled={pending}
                  aria-invalid={Boolean(fieldErrors[descKey])}
                  aria-describedby={
                    fieldErrors[descKey] ? `line-${index}-description-error` : undefined
                  }
                  onChange={(e) => {
                    clearLineField(index, "description");
                    setLines((prev) =>
                      prev.map((l, i) =>
                        i === index ? { ...l, description: e.target.value } : l,
                      ),
                    );
                  }}
                />
                <FieldError id={`line-${index}-description-error`}>
                  {fieldErrors[descKey]}
                </FieldError>
              </div>
              <div className="min-w-0">
                <Input
                  type="number"
                  min={1}
                  value={line.quantity}
                  disabled={pending}
                  aria-invalid={Boolean(fieldErrors[qtyKey])}
                  aria-describedby={
                    fieldErrors[qtyKey] ? `line-${index}-quantity-error` : undefined
                  }
                  onChange={(e) => {
                    clearLineField(index, "quantity");
                    setLines((prev) =>
                      prev.map((l, i) =>
                        i === index ? { ...l, quantity: e.target.value } : l,
                      ),
                    );
                  }}
                />
                <FieldError id={`line-${index}-quantity-error`}>
                  {fieldErrors[qtyKey]}
                </FieldError>
              </div>
              <div className="min-w-0">
                <Input
                  placeholder="£"
                  value={line.unitPricePounds}
                  disabled={pending}
                  aria-invalid={Boolean(fieldErrors[priceKey])}
                  aria-describedby={
                    fieldErrors[priceKey] ? `line-${index}-unitPrice-error` : undefined
                  }
                  onChange={(e) => {
                    clearLineField(index, "unitPricePounds");
                    setLines((prev) =>
                      prev.map((l, i) =>
                        i === index ? { ...l, unitPricePounds: e.target.value } : l,
                      ),
                    );
                  }}
                />
                <FieldError id={`line-${index}-unitPrice-error`}>
                  {fieldErrors[priceKey]}
                </FieldError>
              </div>
              {vatRegistered ? (
                <VatRateField
                  id={`vat-${line.key}`}
                  label=""
                  compact
                  value={choiceFromVatRate(line.vatRate)}
                  onChange={(v) => setLineVat(index, v)}
                  disabled={pending}
                />
              ) : null}
              <p className="flex items-center justify-end text-sm font-medium tabular-nums">
                {totalPence === null ? "—" : formatGBP(totalPence)}
              </p>
              <Button
                type="button"
                variant="ghost"
                className="size-9 shrink-0 px-0"
                aria-label="Remove line"
                disabled={pending || lines.length === 1}
                onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
        <Button
          type="button"
          variant="secondary"
          onClick={() => setLines((p) => [...p, newLine(lineDefault)])}
        >
          <Plus className="h-4 w-4" /> Add line
        </Button>
        <div className="space-y-1 text-right">
          {vatRegistered && totals.vatPence > 0 ? (
            <>
              <p className="text-sm text-muted">
                Net {formatGBP(totals.netPence)}
              </p>
              <p className="text-sm text-muted">
                VAT {formatGBP(totals.vatPence)}
              </p>
            </>
          ) : null}
          <p className="font-medium">Total {formatGBP(totals.grossPence)}</p>
        </div>
      </div>
      <PaymentScheduleEditor
        grossPence={totals.grossPence}
        initialMilestones={initialMilestones}
        disabled={pending}
      />
      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={2}
          defaultValue={quote?.notes ?? ""}
          disabled={pending}
        />
      </div>
      <FormStickyActions error={error}>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : mode === "create" ? "Create quote" : "Save changes"}
        </Button>
      </FormStickyActions>
    </form>
  );
}

/** @deprecated Use QuoteForm */
export function QuoteCreateForm(props: {
  clients: { id: string; name: string; companyName?: string | null }[];
}) {
  return <QuoteForm mode="create" clients={props.clients} />;
}
