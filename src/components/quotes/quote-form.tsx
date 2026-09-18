"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { formatGBP, invoiceTotals, lineNetPence, poundsToPence } from "@/lib/money";
import { PaymentScheduleEditor } from "@/components/quotes/payment-schedule-editor";
import { createQuote, updateQuote } from "@/actions/quotes";
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
  const [error, setError] = useState<string | null>(null);
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

  function onSubmit(formData: FormData) {
    const clientId = String(formData.get("clientId") ?? "").trim();
    if (!clientId) {
      setError("Choose a client");
      return;
    }

    const completeLines = lines.filter(isCompleteLine);
    if (completeLines.length === 0) {
      setError("Add at least one line item");
      return;
    }

    formData.set(
      "linesJson",
      JSON.stringify(
        completeLines.map((l) => ({
          description: l.description,
          quantity: Number(l.quantity),
          unitPricePounds: l.unitPricePounds,
          vatRate: vatRegistered ? l.vatRate : 0,
        })),
      ),
    );
    setError(null);
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createQuote(formData)
          : await updateQuote(quote!.id, formData);
      if (!result.ok) setError(result.error);
      else {
        router.push(`/quotes/${result.id}`);
        router.refresh();
      }
    });
  }

  const lineGrid = vatRegistered
    ? "sm:grid-cols-[1fr_70px_100px_110px_90px_2.5rem]"
    : "sm:grid-cols-[1fr_70px_100px_90px_2.5rem]";

  return (
    <form className="space-y-4" action={onSubmit}>
      <div>
        <Label htmlFor="clientId">Client</Label>
        <Select
          id="clientId"
          name="clientId"
          required
          defaultValue={quote?.clientId ?? ""}
          disabled={pending}
        >
          <option value="">Select…</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {clientDisplayName(c)}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="issueDate">Issue date</Label>
          <Input
            id="issueDate"
            name="issueDate"
            type="date"
            required
            defaultValue={
              quote?.issueDate ?? new Date().toISOString().slice(0, 10)
            }
            disabled={pending}
          />
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
          return (
            <div key={line.key} className={`grid gap-2 ${lineGrid}`}>
              <Input
                placeholder="Description"
                value={line.description}
                disabled={pending}
                onChange={(e) =>
                  setLines((prev) =>
                    prev.map((l, i) =>
                      i === index ? { ...l, description: e.target.value } : l,
                    ),
                  )
                }
              />
              <Input
                type="number"
                min={1}
                value={line.quantity}
                disabled={pending}
                onChange={(e) =>
                  setLines((prev) =>
                    prev.map((l, i) =>
                      i === index ? { ...l, quantity: e.target.value } : l,
                    ),
                  )
                }
              />
              <Input
                placeholder="£"
                value={line.unitPricePounds}
                disabled={pending}
                onChange={(e) =>
                  setLines((prev) =>
                    prev.map((l, i) =>
                      i === index ? { ...l, unitPricePounds: e.target.value } : l,
                    ),
                  )
                }
              />
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
      <FieldError>{error}</FieldError>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : mode === "create" ? "Create quote" : "Save changes"}
      </Button>
    </form>
  );
}

/** @deprecated Use QuoteForm */
export function QuoteCreateForm(props: {
  clients: { id: string; name: string; companyName?: string | null }[];
}) {
  return <QuoteForm mode="create" clients={props.clients} />;
}
