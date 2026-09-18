"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { formatGBP, invoiceTotals, poundsToPence } from "@/lib/money";
import {
  createRecurringInvoice,
  updateRecurringInvoice,
} from "@/actions/recurring-invoices";
import { clientDisplayName } from "@/lib/clients/display";
import {
  VatRateField,
  choiceFromVatRate,
  vatRateFromChoice,
  type VatRateFieldValue,
} from "@/components/documents/vat-rate-field";
import { Plus, Trash2 } from "lucide-react";

export interface RecurringLineDraft {
  key: string;
  description: string;
  quantity: string;
  unitPricePounds: string;
  vatRate: number;
}

function newLine(defaultVatRate: number): RecurringLineDraft {
  return {
    key: crypto.randomUUID(),
    description: "",
    quantity: "1",
    unitPricePounds: "",
    vatRate: defaultVatRate,
  };
}

function isCompleteLine(line: RecurringLineDraft): boolean {
  return (
    line.description.trim().length > 0 && line.unitPricePounds.trim().length > 0
  );
}

export function RecurringInvoiceForm({
  mode,
  clients,
  template,
  initialLines,
  vatRegistered = false,
  defaultVatRate = 0,
}: {
  mode: "create" | "edit";
  clients: { id: string; name: string; companyName?: string | null }[];
  template?: {
    id: string;
    name: string;
    clientId: string;
    notes: string | null;
    dayOfMonth: number;
    onGenerate: "draft" | "send";
    endsOn: string | null;
    maxOccurrences: number | null;
    enabled: boolean;
  };
  initialLines?: RecurringLineDraft[];
  vatRegistered?: boolean;
  defaultVatRate?: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const lineDefault = vatRegistered ? defaultVatRate : 0;
  const [lines, setLines] = useState<RecurringLineDraft[]>(
    initialLines && initialLines.length > 0
      ? initialLines.map((l) => ({
          ...l,
          vatRate: vatRegistered ? l.vatRate : 0,
        }))
      : [newLine(lineDefault)],
  );
  const [onGenerate, setOnGenerate] = useState<"draft" | "send">(
    template?.onGenerate ?? "draft",
  );
  const [enabled, setEnabled] = useState(template?.enabled ?? true);

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

  function setLineVat(index: number, value: VatRateFieldValue) {
    setLines((prev) =>
      prev.map((l, i) =>
        i === index ? { ...l, vatRate: vatRateFromChoice(value) } : l,
      ),
    );
  }

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
    formData.set("onGenerate", onGenerate);
    formData.set("enabled", enabled ? "true" : "false");
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createRecurringInvoice(formData)
          : await updateRecurringInvoice(template!.id, formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/recurring-invoices/${result.id}`);
      router.refresh();
    });
  }

  return (
    <form action={onSubmit} className="mx-auto max-w-3xl space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            required
            maxLength={200}
            placeholder="e.g. Acme monthly retainer"
            defaultValue={template?.name ?? ""}
            disabled={pending}
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="clientId">Client</Label>
          <Select
            id="clientId"
            name="clientId"
            required
            defaultValue={template?.clientId ?? ""}
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
          <Label htmlFor="dayOfMonth">Day of month</Label>
          <Input
            id="dayOfMonth"
            name="dayOfMonth"
            type="number"
            min={1}
            max={28}
            required
            defaultValue={String(template?.dayOfMonth ?? 1)}
            disabled={pending}
          />
          <p className="mt-1 text-xs text-muted">
            1–28. Invoice is generated on this day each month.
          </p>
        </div>
        <div>
          <Label htmlFor="endsOn">End date (optional)</Label>
          <Input
            id="endsOn"
            name="endsOn"
            type="date"
            defaultValue={template?.endsOn ?? ""}
            disabled={pending}
          />
        </div>
        <div>
          <Label htmlFor="maxOccurrences">Max invoices (optional)</Label>
          <Input
            id="maxOccurrences"
            name="maxOccurrences"
            type="number"
            min={1}
            max={1200}
            placeholder="Unlimited"
            defaultValue={
              template?.maxOccurrences != null
                ? String(template.maxOccurrences)
                : ""
            }
            disabled={pending}
          />
        </div>
        <div className="space-y-2">
          <Label>When generated</Label>
          <div className="flex flex-col gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="onGenerateRadio"
                checked={onGenerate === "draft"}
                disabled={pending}
                onChange={() => setOnGenerate("draft")}
              />
              Leave as draft for review
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="onGenerateRadio"
                checked={onGenerate === "send"}
                disabled={pending}
                onChange={() => setOnGenerate("send")}
              />
              Email to client automatically
            </label>
          </div>
          {onGenerate === "send" ? (
            <p className="text-xs text-muted">
              Falls back to draft if the client has no email or sending fails.
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label>Schedule</Label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              disabled={pending}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Enabled (paused when unchecked)
          </label>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Line items</Label>
        <div
          className={`hidden gap-2 text-xs font-medium text-muted sm:grid ${
            vatRegistered
              ? "sm:grid-cols-[1fr_80px_120px_110px_2.5rem]"
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
                ? "sm:grid-cols-[1fr_80px_120px_110px_2.5rem]"
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
        <Label htmlFor="notes">Notes (copied to each invoice)</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={template?.notes ?? ""}
          disabled={pending}
        />
      </div>

      <FieldError>{error}</FieldError>
      <Button type="submit" disabled={pending}>
        {pending
          ? "Saving…"
          : mode === "create"
            ? "Create schedule"
            : "Save changes"}
      </Button>
    </form>
  );
}
