"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { formatGBP, invoiceTotals, poundsToPence } from "@/lib/money";
import { createInvoice, updateInvoice } from "@/actions/invoices";
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

function isCompleteLine(line: LineDraft): boolean {
  return line.description.trim().length > 0 && line.unitPricePounds.trim().length > 0;
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
  const [error, setError] = useState<string | null>(null);
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
    setError(null);
    formData.set(
      "linesJson",
      JSON.stringify(
        lines.filter(isCompleteLine).map((l) => ({
          description: l.description,
          quantity: Number(l.quantity),
          unitPricePounds: l.unitPricePounds,
          vatRate: vatRegistered ? l.vatRate : 0,
        })),
      ),
    );
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createInvoice(formData)
          : await updateInvoice(invoice!.id, formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/invoices/${result.id}`);
      router.refresh();
    });
  }

  function setLineVat(index: number, value: VatRateFieldValue) {
    setLines((prev) =>
      prev.map((l, i) =>
        i === index ? { ...l, vatRate: vatRateFromChoice(value) } : l,
      ),
    );
  }

  return (
    <form action={onSubmit} className="mx-auto max-w-3xl space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="clientId">Client</Label>
          <Select
            id="clientId"
            name="clientId"
            required
            defaultValue={invoice?.clientId ?? ""}
            disabled={pending}
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
        </div>
        <div>
          <Label htmlFor="issueDate">Issue date</Label>
          <Input
            id="issueDate"
            name="issueDate"
            type="date"
            required
            defaultValue={invoice?.issueDate ?? new Date().toISOString().slice(0, 10)}
            disabled={pending}
          />
        </div>
        <div>
          <Label htmlFor="dueDate">Due date</Label>
          <Input
            id="dueDate"
            name="dueDate"
            type="date"
            defaultValue={invoice?.dueDate ?? ""}
            disabled={pending}
          />
          <p className="mt-1 text-xs text-muted">Defaults to issue date + 14 days if blank.</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Line items</Label>
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
        {lines.map((line, index) => (
          <div
            key={line.key}
            className={`grid gap-2 ${
              vatRegistered
                ? "sm:grid-cols-[1fr_70px_100px_110px_2.5rem]"
                : "sm:grid-cols-[1fr_80px_120px_2.5rem]"
            }`}
          >
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
              step={1}
              placeholder="Qty"
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
              placeholder="£ unit"
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
        ))}
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

      <FieldError>{error}</FieldError>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : mode === "create" ? "Create invoice" : "Save changes"}
      </Button>
    </form>
  );
}
