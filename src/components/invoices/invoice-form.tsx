"use client";

import { ClientSelect } from "@/components/clients/client-select";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Textarea } from "@/components/ui/form";
import { FormStickyActions } from "@/components/ui/form-sticky-actions";
import { scheduleFocusFirstFieldError } from "@/components/ui/focus-first-field-error";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import {
  expenseCurrencySymbol,
  formatGBP,
  formatMoney,
  invoiceTotals,
  poundsToPence,
} from "@/lib/money";
import { STERLING, toSterlingPence } from "@/lib/currency";
import {
  DocumentCurrencyFields,
  parseManualRate,
  useDocumentRate,
} from "@/components/documents/document-currency-fields";
import { createInvoice, updateInvoice } from "@/actions/invoices";
import {
  invoiceRawFromFormData,
  parseInvoiceInput,
} from "@/lib/invoices/schema";
import {
  VatRateField,
  choiceFromVatRate,
  vatRateFromChoice,
  type VatRateFieldValue,
} from "@/components/documents/vat-rate-field";
import { Plus, Trash2 } from "lucide-react";
import { PAGE_WIDTH } from "@/components/ui/page-width";

export interface LineDraft {
  key: string;
  description: string;
  quantity: string;
  unitPricePounds: string;
  /** Percent off the line; blank for no discount. */
  discountPercent: string;
  vatRate: number;
  /** Set when the line recharges a rebillable expense. */
  expenseId?: string;
}

/** A rebillable expense the form can add as a line. */
export interface RebillOption {
  id: string;
  clientId: string;
  lineDescription: string;
  /** Date, order and cost, for the picker. */
  detail: string;
  pricePounds: string;
  priceFormatted: string;
}

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

function rebillLine(option: RebillOption, vatRate: number): LineDraft {
  return {
    ...newLine(vatRate),
    description: option.lineDescription,
    unitPricePounds: option.pricePounds,
    expenseId: option.id,
  };
}

export function InvoiceForm({
  mode,
  clients,
  invoice,
  initialLines,
  vatRegistered = false,
  defaultVatRate = 0,
  rebillable = [],
  defaultClientId,
  initialRebillIds = [],
}: {
  mode: "create" | "edit";
  clients: {
    id: string;
    name: string;
    companyName?: string | null;
    defaultCurrency?: string | null;
  }[];
  invoice?: {
    id: string;
    clientId: string;
    issueDate: string | null;
    dueDate: string | null;
    notes: string | null;
    currency: string;
    fxRate: number;
    fxRateSource: "boe" | "manual" | null;
  };
  initialLines?: LineDraft[];
  vatRegistered?: boolean;
  defaultVatRate?: number;
  rebillable?: RebillOption[];
  /** Client to start a new invoice with. */
  defaultClientId?: string;
  /** Rebillable expenses to start a new invoice with. */
  initialRebillIds?: string[];
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
  const [clientId, setClientId] = useState(invoice?.clientId ?? defaultClientId ?? "");
  // Clients created from the picker aren't in `clients` until the page reloads.
  const [createdCurrencies, setCreatedCurrencies] = useState<Record<string, string | null>>({});
  const clientCurrency = (id: string, created?: { defaultCurrency: string | null }) =>
    (created ?? clients.find((c) => c.id === id))?.defaultCurrency ??
    createdCurrencies[id] ??
    STERLING;
  const [currency, setCurrency] = useState(invoice?.currency ?? clientCurrency(clientId));
  // Once the currency is picked by hand, changing the client no longer resets it.
  const [currencyTouched, setCurrencyTouched] = useState(mode === "edit");
  const [manualRate, setManualRate] = useState(
    invoice?.fxRateSource === "manual" ? String(invoice.fxRate) : "",
  );
  const [issueDate, setIssueDate] = useState(
    invoice?.issueDate ?? new Date().toISOString().slice(0, 10),
  );
  const foreign = currency !== STERLING;
  const bankRate = useDocumentRate(currency, issueDate);
  const effectiveRate = foreign ? (parseManualRate(manualRate) ?? bankRate?.fxRate ?? null) : 1;
  const [lines, setLines] = useState<LineDraft[]>(() => {
    if (initialLines && initialLines.length > 0) {
      return initialLines.map((l) => ({
        ...l,
        vatRate: vatRegistered ? l.vatRate : 0,
      }));
    }
    // Recharged expenses only go on GBP invoices.
    const starting =
      currency === STERLING
        ? rebillable.filter((r) => r.clientId === clientId && initialRebillIds.includes(r.id))
        : [];
    const initial =
      starting.length > 0 ? starting.map((o) => rebillLine(o, lineDefault)) : [newLine(lineDefault)];
    // Keys feed DOM ids, so lines rendered on the server need keys that match
    // in the browser; a random key here fails hydration.
    return initial.map((l, i) => ({ ...l, key: `initial-${i}` }));
  });
  // Expenses are recharged at their sterling cost, so only onto GBP invoices.
  const clientRebillable = foreign ? [] : rebillable.filter((r) => r.clientId === clientId);
  const addedExpenseIds = new Set(lines.flatMap((l) => (l.expenseId ? [l.expenseId] : [])));
  const notAdded = clientRebillable.filter((r) => !addedExpenseIds.has(r.id));

  function addRebills(options: RebillOption[]) {
    const added = options.map((o) => rebillLine(o, lineDefault));
    setLines((prev) => {
      const blank =
        prev.length === 1 && !prev[0]!.description.trim() && !prev[0]!.unitPricePounds.trim();
      return blank ? added : [...prev, ...added];
    });
  }

  function changeClient(next: string, created?: { defaultCurrency: string | null }) {
    setClientId(next);
    if (created) setCreatedCurrencies((prev) => ({ ...prev, [next]: created.defaultCurrency }));
    if (!currencyTouched) changeCurrency(clientCurrency(next, created));
    // Recharges belong to one client, so drop another client's.
    const keep = new Set(rebillable.filter((r) => r.clientId === next).map((r) => r.id));
    setLines((prev) => {
      const kept = prev.filter((l) => !l.expenseId || keep.has(l.expenseId));
      return kept.length > 0 ? kept : [newLine(lineDefault)];
    });
  }

  function changeCurrency(next: string) {
    setCurrency(next);
    setManualRate("");
    if (next !== STERLING) {
      // Recharged expenses can't go on a foreign invoice.
      setLines((prev) => {
        const kept = prev.filter((l) => !l.expenseId);
        return kept.length > 0 ? kept : [newLine(lineDefault)];
      });
    }
  }

  const totals = useMemo(() => {
    try {
      return invoiceTotals(
        lines
          .filter((l) => l.description.trim() && l.unitPricePounds.trim())
          .map((l) => ({
            quantity: Number(l.quantity) || 0,
            unitPricePence: poundsToPence(l.unitPricePounds || "0"),
            discountPercent: Number(l.discountPercent) || 0,
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
          discountPercent:
            l.discountPercent.trim() === "" ? 0 : Number(l.discountPercent),
          vatRate: vatRegistered ? l.vatRate : 0,
          ...(l.expenseId ? { expenseId: l.expenseId } : {}),
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
    <form ref={formRef} noValidate onSubmit={preventResetSubmit(onSubmit)} className={`${PAGE_WIDTH.editor} space-y-6`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="clientId" required>
            Client
          </Label>
          <ClientSelect
            id="clientId"
            name="clientId"
            clients={clients}
            defaultValue={clientId}
            placeholder="Select a client…"
            disabled={pending}
            aria-invalid={Boolean(fieldErrors.clientId)}
            aria-describedby={fieldErrors.clientId ? "clientId-error" : undefined}
            onChange={(id, created) => {
              clearField("clientId");
              changeClient(id, created);
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
        <DocumentCurrencyFields
          currency={currency}
          onCurrencyChange={(code) => {
            setCurrencyTouched(true);
            changeCurrency(code);
          }}
          manualRate={manualRate}
          onManualRateChange={setManualRate}
          bankRate={bankRate}
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
              : "sm:grid-cols-[1.5rem_1fr_80px_120px_80px_2.5rem]"
          }`}
        >
          <span aria-hidden="true" />
          <span>Description</span>
          <span>Qty</span>
          <span>
            Unit Cost {expenseCurrencySymbol(currency)}
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
                  : "sm:grid-cols-[1.5rem_1fr_80px_120px_80px_2.5rem]"
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
                {line.expenseId ? (
                  <p className="mt-1 text-xs text-muted">Recharged expense</p>
                ) : null}
              </div>
              <div className="min-w-0">
                <Input
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
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
        {clientRebillable.length > 0 ? (
          <div className="rounded-xl border border-border bg-wash/50 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">Rebillable expenses for this client</p>
              {notAdded.length > 1 ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => addRebills(notAdded)}
                >
                  <Plus className="h-4 w-4" />
                  Add all ({notAdded.length})
                </Button>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-muted">
              {vatRegistered
                ? "Recharged at cost, net of the VAT you reclaim. The line's VAT rate applies."
                : "Recharged at what you paid."}
            </p>
            <ul className="mt-2 divide-y divide-border">
              {clientRebillable.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate">{r.lineDescription}</p>
                    <p className="text-xs text-muted">{r.detail}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="tabular-nums">{r.priceFormatted}</span>
                    {addedExpenseIds.has(r.id) ? (
                      <span className="w-16 text-center text-xs text-muted">Added</span>
                    ) : (
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-16"
                        disabled={pending}
                        onClick={() => addRebills([r])}
                      >
                        <Plus className="h-4 w-4" />
                        Add
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {foreign && rebillable.some((r) => r.clientId === clientId) ? (
          <p className="text-xs text-muted">
            Recharged expenses can only go on a GBP invoice.
          </p>
        ) : null}
        <div className="space-y-1 text-right">
          {vatRegistered && totals.vatPence > 0 ? (
            <>
              <p className="text-sm text-muted">
                Net {formatMoney(totals.netPence, currency)}
              </p>
              <p className="text-sm text-muted">
                VAT {formatMoney(totals.vatPence, currency)}
              </p>
            </>
          ) : null}
          <p className="font-display text-lg font-semibold">
            Total {formatMoney(totals.grossPence, currency)}
          </p>
          {foreign && effectiveRate ? (
            <p className="text-sm text-muted">
              {/* Converted as the server does: net and VAT separately. */}
              About{" "}
              {formatGBP(
                toSterlingPence(totals.netPence, effectiveRate) +
                  toSterlingPence(totals.vatPence, effectiveRate),
              )}{" "}
              in your books
            </p>
          ) : null}
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
