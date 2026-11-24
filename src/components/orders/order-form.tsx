"use client";

import { ClientSelect } from "@/components/clients/client-select";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { createOrder } from "@/actions/orders";
import { PaymentScheduleEditor } from "@/components/quotes/payment-schedule-editor";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Textarea } from "@/components/ui/form";
import { FormStickyActions } from "@/components/ui/form-sticky-actions";
import { scheduleFocusFirstFieldError } from "@/components/ui/focus-first-field-error";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import {
  TaxCodeField,
  choiceFromLineTax,
  lineTaxFromChoice,
  postedLineTax,
  type TaxCodeFieldValue,
} from "@/components/documents/tax-code-field";
import type { TaxCode } from "@/lib/tax-codes";
import {
  expenseCurrencySymbol,
  formatGBP,
  formatMoney,
  invoiceTotals,
  poundsToPence,
} from "@/lib/money";
import { toSterlingPence } from "@/lib/currency";
import {
  DocumentCurrencyFields,
  useDocumentCurrency,
} from "@/components/documents/document-currency-fields";
import { orderRawFromFormData, parseOrderInput } from "@/lib/orders/schema";

type LineDraft = {
  key: string;
  description: string;
  quantity: string;
  unitPricePounds: string;
  /** Percent off the line; blank for no discount. */
  discountPercent: string;
  vatRate: number;
  /** Unset on lines saved before tax codes; the rate then implies it. */
  taxCode?: TaxCode;
};

function newLine(defaultVatRate: number): LineDraft {
  return {
    key: crypto.randomUUID(),
    description: "",
    quantity: "1",
    unitPricePounds: "",
    discountPercent: "",
    vatRate: defaultVatRate,
  };
}

function isCompleteLine(line: LineDraft): boolean {
  return line.description.trim().length > 0 && line.unitPricePounds.trim().length > 0;
}

export function OrderForm({
  clients,
  vatRegistered = false,
  defaultVatRate = 0,
}: {
  clients: {
    id: string;
    name: string;
    companyName?: string | null;
    defaultCurrency?: string | null;
  }[];
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
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const money = useDocumentCurrency({ clients, clientId: "", issueDate });
  const [lines, setLines] = useState<LineDraft[]>(() => [
    // A fixed key: keys feed DOM ids, and a random one fails hydration.
    { ...newLine(lineDefault), key: "initial-0" },
  ]);

  const totals = useMemo(() => {
    try {
      return invoiceTotals(
        lines
          .filter(isCompleteLine)
          .map((l) => ({
            quantity: Number(l.quantity) || 0,
            unitPricePence: poundsToPence(l.unitPricePounds),
            discountPercent: Number(l.discountPercent) || 0,
            ...postedLineTax(l, vatRegistered),
          })),
      );
    } catch {
      return { netPence: 0, vatPence: 0, grossPence: 0 };
    }
  }, [lines, vatRegistered]);

  function setLineVat(index: number, value: TaxCodeFieldValue) {
    setLines((prev) =>
      prev.map((l, i) =>
        i === index ? { ...l, ...lineTaxFromChoice(value) } : l,
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
          discountPercent:
            l.discountPercent.trim() === "" ? 0 : Number(l.discountPercent),
          ...postedLineTax(l, vatRegistered),
        })),
      ),
    );
    const clientParsed = parseOrderInput(orderRawFromFormData(formData));
    if (!clientParsed.ok) {
      applyFail(clientParsed);
      scheduleFocusFirstFieldError(formRef.current, clientParsed.fieldErrors);
      return;
    }
    startTransition(async () => {
      const result = await createOrder(formData);
      if (applyActionResult(result) && result.ok) {
        router.push(`/orders/${result.id}`);
        router.refresh();
      } else if (!result.ok) {
        scheduleFocusFirstFieldError(formRef.current, result.fieldErrors);
      }
    });
  }

  return (
    <form ref={formRef} noValidate className="space-y-4" onSubmit={preventResetSubmit(onSubmit)}>
      <div>
        <Label htmlFor="clientId" required>
          Client
        </Label>
        <ClientSelect
          id="clientId"
          name="clientId"
          clients={clients}
          placeholder="Select…"
          disabled={pending}
          aria-invalid={Boolean(fieldErrors.clientId)}
          aria-describedby={fieldErrors.clientId ? "clientId-error" : undefined}
          onChange={(id, created) => {
            clearField("clientId");
            money.clientChanged(id, created);
          }}
        />
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
          defaultValue={issueDate}
          disabled={pending}
          aria-invalid={Boolean(fieldErrors.issueDate)}
          aria-describedby={fieldErrors.issueDate ? "issueDate-error" : undefined}
          onChange={(e) => {
            clearField("issueDate");
            if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) setIssueDate(e.target.value);
          }}
        />
        <FieldError id="issueDate-error">{fieldErrors.issueDate}</FieldError>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <DocumentCurrencyFields
          currency={money.currency}
          onCurrencyChange={money.pickCurrency}
          manualRate={money.manualRate}
          onManualRateChange={money.setManualRate}
          bankRate={money.bankRate}
          disabled={pending}
          fieldErrors={fieldErrors}
          clearField={clearField}
        />
      </div>
      <div className="space-y-2">
        <Label required>Line items</Label>
        <FieldError id="lines-error">{fieldErrors.lines}</FieldError>
        <div
          className={`hidden gap-2 text-xs font-medium text-muted sm:grid ${
            vatRegistered
              ? "sm:grid-cols-[1.5rem_1fr_70px_100px_80px_110px_2.5rem]"
              : "sm:grid-cols-[1.5rem_1fr_70px_100px_80px_2.5rem]"
          }`}
        >
          <span aria-hidden="true" />
          <span>Description</span>
          <span>Qty</span>
          <span>
            Unit Cost {expenseCurrencySymbol(money.currency)}
            {vatRegistered ? " (ex VAT)" : ""}
          </span>
          <span>Disc %</span>
          {vatRegistered ? <span>VAT</span> : null}
          <span className="sr-only">Remove</span>
        </div>
        {lines.map((line, index) => {
          const descKey = `lines.${index}.description`;
          const qtyKey = `lines.${index}.quantity`;
          const priceKey = `lines.${index}.unitPricePounds`;
          const discountKey = `lines.${index}.discountPercent`;
          return (
            <div
              key={line.key}
              className={`grid gap-2 ${
                vatRegistered
                  ? "sm:grid-cols-[1.5rem_1fr_70px_100px_80px_110px_2.5rem]"
                  : "sm:grid-cols-[1.5rem_1fr_70px_100px_80px_2.5rem]"
              }`}
            >
              <span className="text-sm text-muted tabular-nums sm:pt-[9px] sm:text-right">
                {index + 1}.
              </span>
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
                  min={0}
                  step="any"
                  inputMode="decimal"
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
                  placeholder="unit cost"
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
                    setLines((prev) =>
                      prev.map((l, i) =>
                        i === index ? { ...l, discountPercent: e.target.value } : l,
                      ),
                    );
                  }}
                />
                <FieldError id={`line-${index}-discount-error`}>
                  {fieldErrors[discountKey]}
                </FieldError>
              </div>
              {vatRegistered ? (
                <TaxCodeField
                  id={`vat-${line.key}`}
                  label=""
                  compact
                  value={choiceFromLineTax(line)}
                  onChange={(v) => setLineVat(index, v)}
                  disabled={pending}
                />
              ) : null}
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
                Net {formatMoney(totals.netPence, money.currency)}
              </p>
              <p className="text-sm text-muted">
                VAT {formatMoney(totals.vatPence, money.currency)}
              </p>
            </>
          ) : null}
          <p className="font-medium">Total {formatMoney(totals.grossPence, money.currency)}</p>
          {money.foreign && money.effectiveRate ? (
            <p className="text-sm text-muted">
              About{" "}
              {formatGBP(
                toSterlingPence(totals.netPence, money.effectiveRate) +
                  toSterlingPence(totals.vatPence, money.effectiveRate),
              )}{" "}
              in your books
            </p>
          ) : null}
        </div>
      </div>
      <PaymentScheduleEditor
        grossPence={totals.grossPence}
        currency={money.currency}
        disabled={pending}
      />
      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" rows={2} disabled={pending} />
      </div>
      <FormStickyActions error={error}>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create order"}
        </Button>
      </FormStickyActions>
    </form>
  );
}
