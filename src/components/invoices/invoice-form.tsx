"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { FormStickyActions } from "@/components/ui/form-sticky-actions";
import { scheduleFocusFirstFieldError } from "@/components/ui/focus-first-field-error";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import { formatGBP, invoiceTotals, poundsToPence } from "@/lib/money";
import { createInvoice, updateInvoice } from "@/actions/invoices";
import {
  invoiceRawFromFormData,
  parseInvoiceInput,
} from "@/lib/invoices/schema";
import { clientDisplayName } from "@/lib/clients/display";
import {
  VatRateField,
  choiceFromVatRate,
  vatRateFromChoice,
  type VatRateFieldValue,
} from "@/components/documents/vat-rate-field";
import { Plus, Trash2 } from "lucide-react";

export interface LineDraft {
  key: string;
  description: string;
  quantity: string;
  unitPricePounds: string;
  vatRate: number;
}

function newLine(defaultVatRate: number): LineDraft {
  return {
    key: crypto.randomUUID(),
    description: "",
    quantity: "1",
    unitPricePounds: "",
    vatRate: defaultVatRate,
  };
}

export function InvoiceForm({
  mode,
  clients,
  invoice,
  initialLines,
  vatRegistered = false,
  defaultVatRate = 0,
}: {
  mode: "create" | "edit";
  clients: { id: string; name: string; companyName?: string | null }[];
  invoice?: {
    id: string;
    clientId: string;
    issueDate: string | null;
    dueDate: string | null;
    notes: string | null;
  };
  initialLines?: LineDraft[];
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
  const [lines, setLines] = useState<LineDraft[]>(
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
          .filter((l) => l.description.trim() && l.unitPricePounds.trim())
          .map((l) => ({
            quantity: Number(l.quantity) || 0,
            unitPricePence: poundsToPence(l.unitPricePounds || "0"),
            vatRate: vatRegistered ? l.vatRate : 0,
          })),
      );
    } catch {
      return { netPence: 0, vatPence: 0, grossPence: 0 };
    }
  }, [lines, vatRegistered]);

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
    const clientParsed = parseInvoiceInput(invoiceRawFromFormData(formData));
    if (!clientParsed.ok) {
      applyFail(clientParsed);
      scheduleFocusFirstFieldError(formRef.current, clientParsed.fieldErrors);
      return;
    }
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createInvoice(formData)
          : await updateInvoice(invoice!.id, formData);
      if (applyActionResult(result) && result.ok) {
        router.push(`/invoices/${result.id}`);
        router.refresh();
      } else if (!result.ok) {
        scheduleFocusFirstFieldError(formRef.current, result.fieldErrors);
      }
    });
  }

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

  return (
    <form ref={formRef} noValidate onSubmit={preventResetSubmit(onSubmit)} className="mx-auto max-w-3xl space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="clientId" required>
            Client
          </Label>
          <Select
            id="clientId"
            name="clientId"
            defaultValue={invoice?.clientId ?? ""}
            disabled={pending}
            aria-invalid={Boolean(fieldErrors.clientId)}
            aria-describedby={fieldErrors.clientId ? "clientId-error" : undefined}
            onChange={() => clearField("clientId")}
          >
            <option value="" disabled>
              Select a client…
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {clientDisplayName(c)}
              </option>
            ))}
          </Select>
          <FieldError id="clientId-error">{fieldErrors.clientId}</FieldError>
        </div>
        <div>
          <Label htmlFor="issueDate" required>
            Issue date
          </Label>
          <Input
            id="issueDate"
            name="issueDate"
            type="date"
            defaultValue={invoice?.issueDate ?? new Date().toISOString().slice(0, 10)}
            disabled={pending}
            aria-invalid={Boolean(fieldErrors.issueDate)}
            aria-describedby={fieldErrors.issueDate ? "issueDate-error" : undefined}
            onChange={() => clearField("issueDate")}
          />
          <FieldError id="issueDate-error">{fieldErrors.issueDate}</FieldError>
        </div>
        <div>
          <Label htmlFor="dueDate">Due date</Label>
          <Input
            id="dueDate"
            name="dueDate"
            type="date"
            defaultValue={invoice?.dueDate ?? ""}
            disabled={pending}
            aria-invalid={Boolean(fieldErrors.dueDate)}
            aria-describedby={fieldErrors.dueDate ? "dueDate-error" : undefined}
            onChange={() => clearField("dueDate")}
          />
          <FieldError id="dueDate-error">{fieldErrors.dueDate}</FieldError>
          <p className="mt-1 text-xs text-muted">Defaults to issue date + 14 days if blank.</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label required>Line items</Label>
        <FieldError id="lines-error">{fieldErrors.lines}</FieldError>
        <div
          className={`hidden gap-2 text-xs font-medium text-muted sm:grid ${
            vatRegistered
              ? "sm:grid-cols-[1fr_70px_100px_110px_2.5rem]"
              : "sm:grid-cols-[1fr_80px_120px_2.5rem]"
          }`}
        >
          <span>Description</span>
          <span>Qty</span>
          <span>Unit £ (ex VAT)</span>
          {vatRegistered ? <span>VAT</span> : null}
          <span className="sr-only">Remove</span>
        </div>
        {lines.map((line, index) => {
          const descKey = `lines.${index}.description`;
          const qtyKey = `lines.${index}.quantity`;
          const priceKey = `lines.${index}.unitPricePounds`;
          return (
            <div
              key={line.key}
              className={`grid gap-2 ${
                vatRegistered
                  ? "sm:grid-cols-[1fr_70px_100px_110px_2.5rem]"
                  : "sm:grid-cols-[1fr_80px_120px_2.5rem]"
              }`}
            >
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
                  step={1}
                  placeholder="Qty"
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
                  placeholder="£ unit"
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
              <Button
                type="button"
                variant="ghost"
                className="size-9 shrink-0 px-0"
                disabled={pending || lines.length === 1}
                onClick={() =>
                  setLines((prev) => prev.filter((_, i) => i !== index))
                }
                aria-label="Remove line"
                title={
                  lines.length === 1
                    ? "At least one line is required"
                    : "Remove line"
                }
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
          <p className="font-display text-lg font-semibold">
            Total {formatGBP(totals.grossPence)}
          </p>
        </div>
      </div>

      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={invoice?.notes ?? ""}
          disabled={pending}
        />
      </div>

      <FormStickyActions error={error}>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : mode === "create" ? "Create invoice" : "Save changes"}
        </Button>
      </FormStickyActions>
    </form>
  );
}
